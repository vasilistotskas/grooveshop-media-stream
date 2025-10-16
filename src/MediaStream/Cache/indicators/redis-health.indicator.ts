import type { HealthIndicatorResult } from '@nestjs/terminus'
import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator'
import { Injectable } from '@nestjs/common'
import { RedisCacheService } from '../services/redis-cache.service'

@Injectable()
export class RedisHealthIndicator extends BaseHealthIndicator {
	constructor(
		private readonly redisCacheService: RedisCacheService,
		private readonly _configService: ConfigService,
	) {
		super('redis')
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		const startTime = Date.now()

		try {
			const pingResult = await this.redisCacheService.ping()
			if (pingResult !== 'PONG') {
				throw new Error(`Redis ping failed: ${pingResult}`)
			}

			const testKey = 'health-check-redis-test'
			const testValue = { timestamp: Date.now(), test: true }

			await this.redisCacheService.set(testKey, testValue, 60)

			const retrievedValue = await this.redisCacheService.get<{ timestamp: number, test: boolean }>(testKey)
			if (!retrievedValue || retrievedValue.timestamp !== testValue.timestamp) {
				throw new Error('Redis GET operation failed')
			}

			const ttl = await this.redisCacheService.getTtl(testKey)
			if (ttl <= 0 || ttl > 60) {
				throw new Error(`Redis TTL operation failed: ${ttl}`)
			}

			await this.redisCacheService.delete(testKey)

			const deletedValue = await this.redisCacheService.get(testKey)
			if (deletedValue !== null) {
				throw new Error('Redis DELETE operation failed')
			}

			const stats = await this.redisCacheService.getStats()
			const memoryUsage = await this.redisCacheService.getMemoryUsage()
			const connectionStatus = this.redisCacheService.getConnectionStatus()

			const responseTime = Date.now() - startTime
			const isHealthy = connectionStatus.connected && responseTime <= 200

			const result: HealthIndicatorResult = {
				[this.key]: {
					status: isHealthy ? 'up' : 'down',
					responseTime: `${responseTime}ms`,
					connection: {
						connected: connectionStatus.connected,
						host: this._configService.get('cache.redis.host'),
						port: this._configService.get('cache.redis.port'),
						db: this._configService.get('cache.redis.db'),
					},
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
						responseTime: '200ms',
						hitRate: '70%',
						memoryFragmentation: '1.5',
					},
					warnings: this.generateWarnings(stats, memoryUsage, responseTime, connectionStatus.stats.errors),
				},
			}

			if (isHealthy) {
				CorrelatedLogger.debug(`Redis health check passed in ${responseTime}ms`, RedisHealthIndicator.name)
			}
			else {
				CorrelatedLogger.warn(`Redis health check failed: response time ${responseTime}ms, connected ${connectionStatus.connected}`, RedisHealthIndicator.name)
			}

			return result
		}
		catch (error: unknown) {
			const responseTime = Date.now() - startTime
			CorrelatedLogger.error(`Redis health check failed: ${(error as Error).message}`, (error as Error).stack, RedisHealthIndicator.name)

			return {
				[this.key]: {
					status: 'down',
					error: (error as Error).message,
					responseTime: `${responseTime}ms`,
					connection: {
						connected: false,
						host: this._configService.get('cache.redis.host'),
						port: this._configService.get('cache.redis.port'),
						db: this._configService.get('cache.redis.db'),
					},
					lastCheck: new Date().toISOString(),
				},
			}
		}
	}

	private generateWarnings(stats: any, memoryUsage: any, responseTime: number, errors: number = 0): string[] {
		const warnings: string[] = []

		if (responseTime > 100) {
			warnings.push(`Response time (${responseTime}ms) is slower than optimal (100ms)`)
		}

		if (stats.hitRate < 0.7) {
			warnings.push(`Cache hit rate (${Math.round(stats.hitRate * 100)}%) is below optimal (70%)`)
		}

		if (memoryUsage.fragmentation > 1.5) {
			warnings.push(`Memory fragmentation (${memoryUsage.fragmentation}) is high (>1.5)`)
		}

		if (errors > 0) {
			warnings.push(`Redis has recorded ${errors} errors`)
		}

		const memoryUsageMB = memoryUsage.used / 1024 / 1024
		if (memoryUsageMB > 100) {
			warnings.push(`Memory usage (${Math.round(memoryUsageMB)}MB) is high`)
		}

		return warnings
	}

	async getDetailedStatus(): Promise<any> {
		try {
			const stats = await this.redisCacheService.getStats()
			const memoryUsage = await this.redisCacheService.getMemoryUsage()
			const connectionStatus = this.redisCacheService.getConnectionStatus()
			const keys = await this.redisCacheService.keys()

			return {
				type: 'redis-cache',
				status: connectionStatus.connected ? 'operational' : 'disconnected',
				connection: {
					connected: connectionStatus.connected,
					host: this._configService.get('cache.redis.host'),
					port: this._configService.get('cache.redis.port'),
					db: this._configService.get('cache.redis.db'),
				},
				statistics: {
					...stats,
					operations: connectionStatus.stats.operations,
					errors: connectionStatus.stats.errors,
				},
				memory: {
					...memoryUsage,
					usedMB: Math.round(memoryUsage.used / 1024 / 1024 * 100) / 100,
					peakMB: Math.round(memoryUsage.peak / 1024 / 1024 * 100) / 100,
				},
				configuration: {
					host: this._configService.get('cache.redis.host'),
					port: this._configService.get('cache.redis.port'),
					db: this._configService.get('cache.redis.db'),
					ttl: this._configService.get('cache.redis.ttl'),
					maxRetries: this._configService.get('cache.redis.maxRetries'),
				},
				recentKeys: keys.slice(0, 10),
				lastUpdated: new Date().toISOString(),
			}
		}
		catch (error: unknown) {
			return {
				type: 'redis-cache',
				status: 'error',
				error: (error as Error).message,
				lastUpdated: new Date().toISOString(),
			}
		}
	}

	protected getDescription(): string {
		return 'Redis cache health indicator that tests connection and basic operations'
	}
}
