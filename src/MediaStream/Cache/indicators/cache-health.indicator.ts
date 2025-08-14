import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator'
import { Injectable } from '@nestjs/common'
import { HealthIndicatorResult } from '@nestjs/terminus'
import { CacheWarmingService } from '../services/cache-warming.service'
import { MemoryCacheService } from '../services/memory-cache.service'

@Injectable()
export class CacheHealthIndicator extends BaseHealthIndicator {
	constructor(
		private readonly memoryCacheService: MemoryCacheService,
		private readonly cacheWarmingService: CacheWarmingService,
		private readonly _configService: ConfigService,
	) {
		super('cache')
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		const startTime = Date.now()

		try {
			const testKey = 'health-check-test'
			const testValue = { timestamp: Date.now(), test: true }

			await this.memoryCacheService.set(testKey, testValue, 60)

			const retrievedValue = await this.memoryCacheService.get<{ timestamp: number, test: boolean }>(testKey)
			if (!retrievedValue || retrievedValue.timestamp !== testValue.timestamp) {
				throw new Error('Cache GET operation failed')
			}

			await this.memoryCacheService.delete(testKey)

			const deletedValue = await this.memoryCacheService.get(testKey)
			if (deletedValue !== null) {
				throw new Error('Cache DELETE operation failed')
			}

			const stats = await this.memoryCacheService.getStats()
			const memoryUsage = this.memoryCacheService.getMemoryUsage()
			const warmupStats = await this.cacheWarmingService.getWarmupStats()

			const memoryUsagePercent = (memoryUsage.used / memoryUsage.total) * 100
			const memoryThreshold = this._configService.get('cache.memory.warningThreshold') || 80

			const responseTime = Date.now() - startTime
			const isHealthy = responseTime < 100 && memoryUsagePercent < 90

			const result: HealthIndicatorResult = {
				[this.key]: {
					status: isHealthy ? 'up' : 'down',
					responseTime: `${responseTime}ms`,
					memory: {
						used: memoryUsage.used,
						total: memoryUsage.total,
						usagePercent: Math.round(memoryUsagePercent * 100) / 100,
						warning: memoryUsagePercent > memoryThreshold,
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
						cacheSize: warmupStats.cacheSize,
					},
					thresholds: {
						responseTime: '100ms',
						memoryUsage: `${memoryThreshold}%`,
						hitRate: '70%',
					},
					warnings: this.generateWarnings(stats, memoryUsagePercent, memoryThreshold),
				},
			}

			if (isHealthy) {
				CorrelatedLogger.debug(`Cache health check passed in ${responseTime}ms`, CacheHealthIndicator.name)
			}
			else {
				CorrelatedLogger.warn(`Cache health check failed: response time ${responseTime}ms, memory usage ${memoryUsagePercent}%`, CacheHealthIndicator.name)
			}

			return result
		}
		catch (error: unknown) {
			const responseTime = Date.now() - startTime
			CorrelatedLogger.error(`Cache health check failed: ${(error as Error).message}`, (error as Error).stack, CacheHealthIndicator.name)

			return {
				[this.key]: {
					status: 'down',
					error: (error as Error).message,
					responseTime: `${responseTime}ms`,
					lastCheck: new Date().toISOString(),
				},
			}
		}
	}

	private generateWarnings(stats: any, memoryUsagePercent: number, memoryThreshold: number): string[] {
		const warnings: string[] = []

		if (memoryUsagePercent > memoryThreshold) {
			warnings.push(`Memory usage (${memoryUsagePercent}%) exceeds threshold (${memoryThreshold}%)`)
		}

		if (stats.hitRate < 0.7) {
			warnings.push(`Cache hit rate (${Math.round(stats.hitRate * 100)}%) is below optimal (70%)`)
		}

		if (stats.keys > 900) {
			warnings.push(`Cache key count (${stats.keys}) is approaching limit`)
		}

		return warnings
	}

	async getDetailedStatus(): Promise<any> {
		try {
			const stats = await this.memoryCacheService.getStats()
			const memoryUsage = this.memoryCacheService.getMemoryUsage()
			const warmupStats = await this.cacheWarmingService.getWarmupStats()
			const keys = await this.memoryCacheService.keys()

			return {
				type: 'memory-cache',
				status: 'operational',
				statistics: stats,
				memory: memoryUsage,
				warming: warmupStats,
				configuration: {
					maxKeys: this._configService.get('cache.memory.maxKeys') || 1000,
					defaultTtl: this._configService.get('cache.memory.defaultTtl') || 3600,
					checkPeriod: this._configService.get('cache.memory.checkPeriod') || 600,
				},
				recentKeys: keys.slice(0, 10),
				lastUpdated: new Date().toISOString(),
			}
		}
		catch (error: unknown) {
			return {
				type: 'memory-cache',
				status: 'error',
				error: (error as Error).message,
				lastUpdated: new Date().toISOString(),
			}
		}
	}

	protected getDescription(): string {
		return 'Memory cache health indicator that tests cache operations and monitors memory usage'
	}
}
