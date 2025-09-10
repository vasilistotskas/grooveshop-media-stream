import { Buffer } from 'node:buffer'
import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import Redis from 'ioredis'
import { CacheStats, ICacheManager } from '../interfaces/cache-manager.interface'

@Injectable()
export class RedisCacheService implements ICacheManager, OnModuleInit, OnModuleDestroy {
	private redis!: Redis
	private isConnected = false
	private stats = {
		hits: 0,
		misses: 0,
		operations: 0,
		errors: 0,
	}

	constructor(
		private readonly _configService: ConfigService,
		private readonly metricsService: MetricsService,
	) { }

	async onModuleInit(): Promise<void> {
		await this.initializeRedis()
	}

	async onModuleDestroy(): Promise<void> {
		if (this.redis) {
			await this.redis.quit()
			CorrelatedLogger.log('Redis connection closed', RedisCacheService.name)
		}
	}

	private async initializeRedis(): Promise<void> {
		try {
			const config = this._configService.get('cache.redis')

			this.redis = new Redis({
				host: config.host,
				port: config.port,
				password: config.password,
				db: config.db,
				maxRetriesPerRequest: config.maxRetries,
				enableReadyCheck: true,
				lazyConnect: true,
				keepAlive: 30000,
				connectTimeout: 10000,
				commandTimeout: 5000,
			})

			this.redis.on('connect', () => {
				CorrelatedLogger.log('Redis connecting...', RedisCacheService.name)
			})

			this.redis.on('ready', () => {
				this.isConnected = true
				CorrelatedLogger.log('Redis connection ready', RedisCacheService.name)
				this.metricsService.updateActiveConnections('redis', 1)
			})

			this.redis.on('error', (error: unknown) => {
				this.isConnected = false
				this.stats.errors++
				CorrelatedLogger.error(`Redis connection error: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
				this.metricsService.updateActiveConnections('redis', 0)
			})

			this.redis.on('close', () => {
				this.isConnected = false
				CorrelatedLogger.warn('Redis connection closed', RedisCacheService.name)
				this.metricsService.updateActiveConnections('redis', 0)
			})

			this.redis.on('reconnecting', () => {
				CorrelatedLogger.log('Redis reconnecting...', RedisCacheService.name)
			})

			await this.redis.connect()
		}
		catch (error: unknown) {
			this.isConnected = false
			CorrelatedLogger.error(`Failed to initialize Redis: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
			throw error
		}
	}

	async get<T>(key: string): Promise<T | null> {
		if (!this.isConnected) {
			CorrelatedLogger.warn('Redis not connected, returning null', RedisCacheService.name)
			this.stats.misses++
			this.metricsService.recordCacheOperation('get', 'redis', 'miss')
			return null
		}

		try {
			this.stats.operations++
			const value = await this.redis.get(key)

			if (value === null) {
				this.stats.misses++
				this.metricsService.recordCacheOperation('get', 'redis', 'miss')
				CorrelatedLogger.debug(`Redis cache MISS: ${key}`, RedisCacheService.name)
				return null
			}

			this.stats.hits++
			this.metricsService.recordCacheOperation('get', 'redis', 'hit')
			CorrelatedLogger.debug(`Redis cache HIT: ${key}`, RedisCacheService.name)

			return this.deserializeValue(value) as T
		}
		catch (error: unknown) {
			this.stats.errors++
			this.stats.misses++
			this.metricsService.recordCacheOperation('get', 'redis', 'error')
			CorrelatedLogger.error(`Redis cache GET error for key ${key}: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
			return null
		}
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		if (!this.isConnected) {
			CorrelatedLogger.warn('Redis not connected, skipping SET operation', RedisCacheService.name)
			return
		}

		try {
			this.stats.operations++
			const serializedValue = this.serializeValue(value)
			const defaultTtl = this._configService.get('cache.redis.ttl')
			const effectiveTtl = ttl !== undefined ? ttl : defaultTtl

			if (effectiveTtl > 0) {
				await this.redis.setex(key, effectiveTtl, serializedValue)
			}
			else {
				await this.redis.set(key, serializedValue)
			}

			this.metricsService.recordCacheOperation('set', 'redis', 'success')
			CorrelatedLogger.debug(`Redis cache SET: ${key} (TTL: ${effectiveTtl}s)`, RedisCacheService.name)
		}
		catch (error: unknown) {
			this.stats.errors++
			this.metricsService.recordCacheOperation('set', 'redis', 'error')
			CorrelatedLogger.error(`Redis cache SET error for key ${key}: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
		}
	}

	async delete(key: string): Promise<void> {
		if (!this.isConnected) {
			CorrelatedLogger.warn('Redis not connected, skipping DELETE operation', RedisCacheService.name)
			return
		}

		try {
			this.stats.operations++
			await this.redis.del(key)
			this.metricsService.recordCacheOperation('delete', 'redis', 'success')
			CorrelatedLogger.debug(`Redis cache DELETE: ${key}`, RedisCacheService.name)
		}
		catch (error: unknown) {
			this.stats.errors++
			this.metricsService.recordCacheOperation('delete', 'redis', 'error')
			CorrelatedLogger.error(`Redis cache DELETE error for key ${key}: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
			throw error
		}
	}

	async clear(): Promise<void> {
		if (!this.isConnected) {
			CorrelatedLogger.warn('Redis not connected, skipping CLEAR operation', RedisCacheService.name)
			return
		}

		try {
			this.stats.operations++
			const db = this._configService.get('cache.redis.db')
			await this.redis.flushdb()
			this.metricsService.recordCacheOperation('clear', 'redis', 'success')
			CorrelatedLogger.debug(`Redis cache CLEARED (DB: ${db})`, RedisCacheService.name)
		}
		catch (error: unknown) {
			this.stats.errors++
			this.metricsService.recordCacheOperation('clear', 'redis', 'error')
			CorrelatedLogger.error(`Redis cache CLEAR error: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
			throw error
		}
	}

	async has(key: string): Promise<boolean> {
		if (!this.isConnected) {
			return false
		}

		try {
			this.stats.operations++
			const exists = await this.redis.exists(key)
			return exists === 1
		}
		catch (error: unknown) {
			this.stats.errors++
			CorrelatedLogger.error(`Redis cache HAS error for key ${key}: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
			return false
		}
	}

	async exists(key: string): Promise<boolean> {
		return this.has(key)
	}

	async keys(): Promise<string[]> {
		if (!this.isConnected) {
			return []
		}

		try {
			this.stats.operations++
			return await this.redis.keys('*')
		}
		catch (error: unknown) {
			this.stats.errors++
			CorrelatedLogger.error(`Redis cache KEYS error: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
			return []
		}
	}

	async flushAll(): Promise<void> {
		if (!this.isConnected) {
			CorrelatedLogger.warn('Redis not connected, skipping FLUSH operation', RedisCacheService.name)
			return
		}

		try {
			this.stats.operations++
			await this.redis.flushall()
			this.metricsService.recordCacheOperation('flush', 'redis', 'success')
			CorrelatedLogger.debug('Redis cache FLUSHED ALL', RedisCacheService.name)
		}
		catch (error: unknown) {
			this.stats.errors++
			this.metricsService.recordCacheOperation('flush', 'redis', 'error')
			CorrelatedLogger.error(`Redis cache FLUSH error: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
			throw error
		}
	}

	async getStats(): Promise<CacheStats> {
		try {
			const hitRate = this.stats.hits + this.stats.misses > 0
				? this.stats.hits / (this.stats.hits + this.stats.misses)
				: 0

			this.metricsService.updateCacheHitRatio('redis', hitRate)

			let keys = 0
			let memoryUsage = 0

			if (this.isConnected) {
				try {
					const info = await this.redis.info('keyspace')
					const dbInfo = info.match(/db\d+:keys=(\d+)/)
					keys = dbInfo ? Number.parseInt(dbInfo[1]) : 0

					const memInfo = await this.redis.info('memory')
					const memMatch = memInfo.match(/used_memory:(\d+)/)
					memoryUsage = memMatch ? Number.parseInt(memMatch[1]) : 0
				}
				catch (error: unknown) {
					CorrelatedLogger.warn(`Failed to get Redis info: ${(error as Error).message}`, RedisCacheService.name)
				}
			}

			return {
				hits: this.stats.hits,
				misses: this.stats.misses,
				keys,
				ksize: 0,
				vsize: memoryUsage,
				hitRate,
			}
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Redis cache STATS error: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
			return {
				hits: this.stats.hits,
				misses: this.stats.misses,
				keys: 0,
				ksize: 0,
				vsize: 0,
				hitRate: 0,
			}
		}
	}

	async ping(): Promise<string> {
		if (!this.isConnected) {
			throw new Error('Redis not connected')
		}
		return await this.redis.ping()
	}

	async getTtl(key: string): Promise<number> {
		if (!this.isConnected) {
			return -1
		}

		try {
			return await this.redis.ttl(key)
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Redis TTL error for key ${key}: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
			return -1
		}
	}

	async setTtl(key: string, ttl: number): Promise<boolean> {
		if (!this.isConnected) {
			return false
		}

		try {
			const result = await this.redis.expire(key, ttl)
			return result === 1
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Redis EXPIRE error for key ${key}: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
			return false
		}
	}

	getConnectionStatus(): { connected: boolean, stats: typeof this.stats } {
		return {
			connected: this.isConnected,
			stats: { ...this.stats },
		}
	}

	async getMemoryUsage(): Promise<{ used: number, peak: number, fragmentation: number }> {
		if (!this.isConnected) {
			return { used: 0, peak: 0, fragmentation: 0 }
		}

		try {
			const info = await this.redis.info('memory')
			const used = this.extractMemoryValue(info, 'used_memory')
			const peak = this.extractMemoryValue(info, 'used_memory_peak')
			const fragmentation = this.extractMemoryValue(info, 'mem_fragmentation_ratio')

			return { used, peak, fragmentation }
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Redis memory info error: ${(error as Error).message}`, (error as Error).stack, RedisCacheService.name)
			return { used: 0, peak: 0, fragmentation: 0 }
		}
	}

	private extractMemoryValue(info: string, key: string): number {
		const match = info.match(new RegExp(`${key}:(\\d+(?:\\.\\d+)?)`))
		return match ? Number.parseFloat(match[1]) : 0
	}

	/**
	 * Serialize value for Redis storage, handling Buffers properly
	 */
	private serializeValue<T>(value: T): string {
		return JSON.stringify(value, (key, val) => {
			if (Buffer.isBuffer(val)) {
				return {
					type: 'Buffer',
					data: val.toString('base64'),
				}
			}
			return val
		})
	}

	/**
	 * Deserialize value from Redis storage, reconstructing Buffers properly
	 */
	private deserializeValue<T>(value: string): T {
		return JSON.parse(value, (key, val) => {
			if (val && typeof val === 'object' && val.type === 'Buffer' && typeof val.data === 'string') {
				return Buffer.from(val.data, 'base64')
			}
			return val
		})
	}
}
