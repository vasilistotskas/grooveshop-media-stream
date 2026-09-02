import type { HealthIndicatorResult } from '@nestjs/terminus'
import type { CacheStats } from '../interfaces/cache-manager.interface.js'
import { Injectable } from '@nestjs/common'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { BaseHealthIndicator } from '#microservice/Health/base/base-health-indicator'
import { CacheWarmingService } from '../services/cache-warming.service.js'
import { MemoryCacheService } from '../services/memory-cache.service.js'

/** A round trip through the in-process cache slower than this means the event loop is starved. */
const RESPONSE_TIME_LIMIT_MS = 100
/** Byte usage above this share of the budget makes the indicator report `down`. */
const MEMORY_DOWN_PERCENT = 90
const HIT_RATE_WARNING = 0.7
const HEALTH_CHECK_KEY = 'health-check-test'

@Injectable()
export class CacheHealthIndicator extends BaseHealthIndicator {
	private readonly warningThresholdPercent: number
	private readonly keyCountWarning: number

	constructor(
		private readonly memoryCacheService: MemoryCacheService,
		private readonly cacheWarmingService: CacheWarmingService,
		configService: ConfigService,
	) {
		super('cache')
		this.warningThresholdPercent = configService.get<number>('cache.memory.warningThreshold')
		// node-cache throws ECACHEFULL at maxKeys, so warn at the same share of the key budget as of the byte budget.
		this.keyCountWarning = Math.floor(configService.get<number>('cache.memory.maxKeys') * this.warningThresholdPercent / 100)
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		const startTime = Date.now()

		try {
			const testValue = { timestamp: Date.now(), test: true }

			await this.memoryCacheService.set(HEALTH_CHECK_KEY, testValue, 60)

			const retrievedValue = await this.memoryCacheService.get<{ timestamp: number, test: boolean }>(HEALTH_CHECK_KEY)
			if (!retrievedValue || retrievedValue.timestamp !== testValue.timestamp) {
				throw new Error('Cache GET operation failed')
			}

			await this.memoryCacheService.delete(HEALTH_CHECK_KEY)

			if (await this.memoryCacheService.get(HEALTH_CHECK_KEY) !== null) {
				throw new Error('Cache DELETE operation failed')
			}

			const stats = await this.memoryCacheService.getStats()
			const memoryUsage = this.memoryCacheService.getMemoryUsage()
			const warmupStats = await this.cacheWarmingService.getWarmupStats()

			const memoryUsagePercent = (memoryUsage.used / memoryUsage.total) * 100
			const responseTime = Date.now() - startTime
			const isHealthy = responseTime < RESPONSE_TIME_LIMIT_MS && memoryUsagePercent < MEMORY_DOWN_PERCENT

			if (isHealthy) {
				CorrelatedLogger.debug(`Cache health check passed in ${responseTime}ms`, CacheHealthIndicator.name)
			}
			else {
				CorrelatedLogger.warn(`Cache health check failed: response time ${responseTime}ms, memory usage ${memoryUsagePercent}%`, CacheHealthIndicator.name)
			}

			return {
				[this.key]: {
					status: isHealthy ? 'up' : 'down',
					responseTime: `${responseTime}ms`,
					memory: {
						used: memoryUsage.used,
						total: memoryUsage.total,
						usagePercent: Math.round(memoryUsagePercent * 100) / 100,
						warning: memoryUsagePercent > this.warningThresholdPercent,
					},
					statistics: {
						hits: stats.hits,
						misses: stats.misses,
						hitRate: Math.round(stats.hitRate * 10000) / 100,
						keys: stats.keys,
						keySize: stats.ksize,
						valueSize: stats.vsize,
					},
					warming: {
						enabled: warmupStats.enabled,
						filesWarmed: warmupStats.filesWarmed,
					},
					thresholds: {
						responseTime: `${RESPONSE_TIME_LIMIT_MS}ms`,
						memoryUsage: `${this.warningThresholdPercent}%`,
						hitRate: `${HIT_RATE_WARNING * 100}%`,
						keys: this.keyCountWarning,
					},
					warnings: this.generateWarnings(stats, memoryUsagePercent),
				},
			}
		}
		catch (error: unknown) {
			const responseTime = Date.now() - startTime
			CorrelatedLogger.error(`Cache health check failed: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, CacheHealthIndicator.name)

			return {
				[this.key]: {
					status: 'down',
					error: errorMessage(error),
					responseTime: `${responseTime}ms`,
					lastCheck: new Date().toISOString(),
				},
			}
		}
	}

	private generateWarnings(stats: CacheStats, memoryUsagePercent: number): string[] {
		const warnings: string[] = []

		if (memoryUsagePercent > this.warningThresholdPercent) {
			warnings.push(`Memory usage (${memoryUsagePercent}%) exceeds threshold (${this.warningThresholdPercent}%)`)
		}

		if (stats.hitRate < HIT_RATE_WARNING) {
			warnings.push(`Cache hit rate (${Math.round(stats.hitRate * 100)}%) is below optimal (${HIT_RATE_WARNING * 100}%)`)
		}

		if (stats.keys >= this.keyCountWarning) {
			warnings.push(`Cache key count (${stats.keys}) is approaching the limit (${this.keyCountWarning})`)
		}

		return warnings
	}

	protected getDescription(): string {
		return 'Memory cache health indicator that tests cache operations and monitors memory usage'
	}
}
