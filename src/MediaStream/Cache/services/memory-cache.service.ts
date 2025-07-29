import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { Injectable, Logger } from '@nestjs/common'
import NodeCache from 'node-cache'
import { CacheStats, ICacheManager } from '../interfaces/cache-manager.interface'

@Injectable()
export class MemoryCacheService implements ICacheManager {
	private readonly logger = new Logger(MemoryCacheService.name)
	protected readonly cache: NodeCache

	constructor(
		private readonly configService: ConfigService,
		private readonly metricsService: MetricsService,
	) {
		const config = this.configService.get('cache.memory') || {}

		this.cache = new NodeCache({
			stdTTL: config.defaultTtl || 3600, // 1 hour default
			checkperiod: config.checkPeriod || 600, // 10 minutes
			useClones: false, // Better performance, but be careful with object mutations
			deleteOnExpire: true,
			maxKeys: config.maxKeys || 1000,
		})

		// Set up event listeners for metrics
		this.cache.on('set', (key: string, _value: any) => {
			this.metricsService.recordCacheOperation('set', 'memory', 'success')
			CorrelatedLogger.debug(`Memory cache SET: ${key}`, MemoryCacheService.name)
		})

		this.cache.on('get', (key: string, value: any) => {
			if (value !== undefined) {
				this.metricsService.recordCacheOperation('get', 'memory', 'hit')
				CorrelatedLogger.debug(`Memory cache HIT: ${key}`, MemoryCacheService.name)
			}
			else {
				this.metricsService.recordCacheOperation('get', 'memory', 'miss')
				CorrelatedLogger.debug(`Memory cache MISS: ${key}`, MemoryCacheService.name)
			}
		})

		this.cache.on('del', (key: string, _value: any) => {
			this.metricsService.recordCacheOperation('delete', 'memory', 'success')
			CorrelatedLogger.debug(`Memory cache DELETE: ${key}`, MemoryCacheService.name)
		})

		this.cache.on('expired', (key: string, _value: any) => {
			this.metricsService.recordCacheOperation('expire', 'memory', 'success')
			CorrelatedLogger.debug(`Memory cache EXPIRED: ${key}`, MemoryCacheService.name)
		})

		this.cache.on('flush', () => {
			this.metricsService.recordCacheOperation('flush', 'memory', 'success')
			CorrelatedLogger.debug('Memory cache FLUSHED', MemoryCacheService.name)
		})
	}

	async get<T>(key: string): Promise<T | null> {
		try {
			const value = this.cache.get<T>(key)
			return value !== undefined ? value : null
		}
		catch (error) {
			this.metricsService.recordCacheOperation('get', 'memory', 'error')
			CorrelatedLogger.error(`Memory cache GET error for key ${key}: ${error.message}`, error.stack, MemoryCacheService.name)
			return null
		}
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		try {
			const success = this.cache.set(key, value, ttl)
			if (!success) {
				this.metricsService.recordCacheOperation('set', 'memory', 'error')
				CorrelatedLogger.warn(`Failed to set memory cache key: ${key}`, MemoryCacheService.name)
			}
		}
		catch (error) {
			this.metricsService.recordCacheOperation('set', 'memory', 'error')
			CorrelatedLogger.error(`Memory cache SET error for key ${key}: ${error.message}`, error.stack, MemoryCacheService.name)
			throw error
		}
	}

	async delete(key: string): Promise<void> {
		try {
			this.cache.del(key)
		}
		catch (error) {
			this.metricsService.recordCacheOperation('delete', 'memory', 'error')
			CorrelatedLogger.error(`Memory cache DELETE error for key ${key}: ${error.message}`, error.stack, MemoryCacheService.name)
			throw error
		}
	}

	async clear(): Promise<void> {
		try {
			this.cache.flushAll()
		}
		catch (error) {
			this.metricsService.recordCacheOperation('clear', 'memory', 'error')
			CorrelatedLogger.error(`Memory cache CLEAR error: ${error.message}`, error.stack, MemoryCacheService.name)
			throw error
		}
	}

	async getStats(): Promise<CacheStats> {
		try {
			const stats = this.cache.getStats()
			const hitRate = stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0

			// Update metrics
			this.metricsService.updateCacheHitRatio('memory', hitRate)

			return {
				hits: stats.hits,
				misses: stats.misses,
				keys: stats.keys,
				ksize: stats.ksize,
				vsize: stats.vsize,
				hitRate,
			}
		}
		catch (error) {
			CorrelatedLogger.error(`Memory cache STATS error: ${error.message}`, error.stack, MemoryCacheService.name)
			return {
				hits: 0,
				misses: 0,
				keys: 0,
				ksize: 0,
				vsize: 0,
				hitRate: 0,
			}
		}
	}

	async has(key: string): Promise<boolean> {
		try {
			return this.cache.has(key)
		}
		catch (error) {
			CorrelatedLogger.error(`Memory cache HAS error for key ${key}: ${error.message}`, error.stack, MemoryCacheService.name)
			return false
		}
	}

	async exists(key: string): Promise<boolean> {
		return this.has(key)
	}

	async keys(): Promise<string[]> {
		try {
			return this.cache.keys()
		}
		catch (error) {
			CorrelatedLogger.error(`Memory cache KEYS error: ${error.message}`, error.stack, MemoryCacheService.name)
			return []
		}
	}

	async flushAll(): Promise<void> {
		try {
			this.cache.flushAll()
		}
		catch (error) {
			this.metricsService.recordCacheOperation('flush', 'memory', 'error')
			CorrelatedLogger.error(`Memory cache FLUSH error: ${error.message}`, error.stack, MemoryCacheService.name)
			throw error
		}
	}

	// Additional memory-specific methods
	getTtl(key: string): number {
		return this.cache.getTtl(key)
	}

	setTtl(key: string, ttl: number): boolean {
		return this.cache.ttl(key, ttl)
	}

	getMemoryUsage(): { used: number, total: number } {
		const stats = this.cache.getStats()
		return {
			used: stats.vsize + stats.ksize,
			total: this.configService.get('cache.memory.maxSize') || 100 * 1024 * 1024, // 100MB default
		}
	}
}
