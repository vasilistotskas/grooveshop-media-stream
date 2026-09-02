import type { HealthIndicatorResult } from '@nestjs/terminus'
import type { RedisConfig } from '#microservice/Config/interfaces/app-config.interface'
import type { CacheStats } from '../interfaces/cache-manager.interface.js'
import { Injectable } from '@nestjs/common'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { BaseHealthIndicator } from '#microservice/Health/base/base-health-indicator'
import { RedisCacheService } from '../services/redis-cache.service.js'

/** PING + SET + GET slower than this marks Redis `down`. */
const RESPONSE_TIME_DOWN_MS = 200
const RESPONSE_TIME_WARN_MS = 100
const HIT_RATE_WARNING = 0.7
const FRAGMENTATION_WARNING = 1.5
const MEMORY_WARNING_MB = 100
const HEALTH_CHECK_KEY = 'health-check-redis-test'

interface RedisMemoryUsage {
	used: number
	peak: number
	fragmentation: number
}

@Injectable()
export class RedisHealthIndicator extends BaseHealthIndicator {
	private lastHealthCheck: { result: HealthIndicatorResult, timestamp: number } | null = null
	private readonly healthCheckCacheTtl: number
	private readonly connection: Pick<RedisConfig, 'host' | 'port' | 'db'>

	constructor(
		private readonly redisCacheService: RedisCacheService,
		configService: ConfigService,
	) {
		super('redis')
		const config = configService.get<RedisConfig>('cache.redis')
		this.healthCheckCacheTtl = config.healthCheckCacheTtl
		this.connection = { host: config.host, port: config.port, db: config.db }
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		// Memoised: probes fire every few seconds and must not load Redis
		if (this.lastHealthCheck && Date.now() - this.lastHealthCheck.timestamp < this.healthCheckCacheTtl) {
			CorrelatedLogger.debug('Returning cached Redis health check result', RedisHealthIndicator.name)
			return this.lastHealthCheck.result
		}

		const startTime = Date.now()

		try {
			const pingResult = await this.redisCacheService.ping()
			if (pingResult !== 'PONG') {
				throw new Error(`Redis ping failed: ${pingResult}`)
			}

			const testValue = Date.now()
			await this.redisCacheService.set(HEALTH_CHECK_KEY, testValue, 60)
			if (await this.redisCacheService.get<number>(HEALTH_CHECK_KEY) !== testValue) {
				throw new Error('Redis GET operation failed')
			}

			const stats = await this.redisCacheService.getStats()
			const memoryUsage = await this.redisCacheService.getMemoryUsage()
			const connectionStatus = this.redisCacheService.getConnectionStatus()

			const responseTime = Date.now() - startTime
			const isHealthy = connectionStatus.connected && responseTime <= RESPONSE_TIME_DOWN_MS

			if (isHealthy) {
				CorrelatedLogger.debug(`Redis health check passed in ${responseTime}ms`, RedisHealthIndicator.name)
			}
			else {
				CorrelatedLogger.warn(`Redis health check failed: response time ${responseTime}ms, connected ${connectionStatus.connected}`, RedisHealthIndicator.name)
			}

			const result: HealthIndicatorResult = {
				[this.key]: {
					status: isHealthy ? 'up' : 'down',
					responseTime: `${responseTime}ms`,
					connection: { connected: connectionStatus.connected, ...this.connection },
					statistics: {
						hits: stats.hits,
						misses: stats.misses,
						hitRate: Math.round(stats.hitRate * 10000) / 100,
						keys: stats.keys,
						operations: connectionStatus.stats.operations,
						errors: connectionStatus.stats.errors,
					},
					memory: {
						used: memoryUsage.used,
						peak: memoryUsage.peak,
						fragmentation: memoryUsage.fragmentation,
						usedMB: Math.round(memoryUsage.used / 1024 / 1024 * 100) / 100,
					},
					thresholds: {
						responseTime: `${RESPONSE_TIME_DOWN_MS}ms`,
						hitRate: `${HIT_RATE_WARNING * 100}%`,
						memoryFragmentation: `${FRAGMENTATION_WARNING}`,
					},
					warnings: this.generateWarnings(stats, memoryUsage, responseTime, connectionStatus.stats.errors),
				},
			}

			this.lastHealthCheck = { result, timestamp: Date.now() }
			return result
		}
		catch (error: unknown) {
			const responseTime = Date.now() - startTime
			CorrelatedLogger.error(`Redis health check failed: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, RedisHealthIndicator.name)

			return {
				[this.key]: {
					status: 'down',
					error: errorMessage(error),
					responseTime: `${responseTime}ms`,
					connection: { connected: false, ...this.connection },
					lastCheck: new Date().toISOString(),
				},
			}
		}
	}

	private generateWarnings(stats: CacheStats, memoryUsage: RedisMemoryUsage, responseTime: number, errors: number): string[] {
		const warnings: string[] = []

		if (responseTime > RESPONSE_TIME_WARN_MS) {
			warnings.push(`Response time (${responseTime}ms) is slower than optimal (${RESPONSE_TIME_WARN_MS}ms)`)
		}

		if (stats.hitRate < HIT_RATE_WARNING) {
			warnings.push(`Cache hit rate (${Math.round(stats.hitRate * 100)}%) is below optimal (${HIT_RATE_WARNING * 100}%)`)
		}

		if (memoryUsage.fragmentation > FRAGMENTATION_WARNING) {
			warnings.push(`Memory fragmentation (${memoryUsage.fragmentation}) is high (>${FRAGMENTATION_WARNING})`)
		}

		if (errors > 0) {
			warnings.push(`Redis has recorded ${errors} errors`)
		}

		const memoryUsageMB = memoryUsage.used / 1024 / 1024
		if (memoryUsageMB > MEMORY_WARNING_MB) {
			warnings.push(`Memory usage (${Math.round(memoryUsageMB)}MB) is high`)
		}

		return warnings
	}

	protected getDescription(): string {
		return 'Redis cache health indicator that tests connection and basic operations'
	}
}
