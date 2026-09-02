import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { RedisConfig } from '#microservice/Config/interfaces/app-config.interface'
import type { CacheStats, ICacheManager } from '../interfaces/cache-manager.interface.js'
import { Buffer } from 'node:buffer'
import { Injectable } from '@nestjs/common'
import { Redis } from 'ioredis'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { isProduction } from '#microservice/common/utils/runtime-env.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { IMAGE_KEY_PATTERN } from '../utils/cache-namespace.util.js'

const USED_MEMORY_RE = /used_memory:(\d+)/
/** Reconnect backoff: 2s, 4s, … capped at 30s (ioredis drives the retries). */
const RECONNECT_MAX_DELAY_MS = 30000
const KEEP_ALIVE_MS = 30000
const CONNECT_TIMEOUT_MS = 10000
const COMMAND_TIMEOUT_MS = 5000
const SCAN_BATCH = 100

/**
 * Binary envelope for cached images: [0x00][u32 metadata length][metadata JSON][raw bytes].
 * 0x00 can never start a JSON document, so plain-JSON values stay distinguishable.
 */
const BINARY_MARKER = 0x00
const BINARY_HEADER_BYTES = 5

@Injectable()
export class RedisCacheService implements ICacheManager, OnModuleInit, OnModuleDestroy {
	private redis!: Redis
	private readonly config: RedisConfig
	private readonly keyspaceKeysRe: RegExp
	private readonly stats = {
		hits: 0,
		misses: 0,
		operations: 0,
		errors: 0,
	}

	constructor(
		configService: ConfigService,
		private readonly metricsService: MetricsService,
	) {
		this.config = configService.get<RedisConfig>('cache.redis')
		// `INFO keyspace` lists every populated DB; only the configured one counts.
		this.keyspaceKeysRe = new RegExp(`^db${this.config.db}:keys=(\\d+)`, 'm')
	}

	async onModuleInit(): Promise<void> {
		if (isProduction() && !this.config.password) {
			throw new Error('[RedisCacheService] REDIS_PASSWORD is required in production. Set the REDIS_PASSWORD environment variable and restart.')
		}

		this.redis = new Redis({
			host: this.config.host,
			port: this.config.port,
			password: this.config.password,
			db: this.config.db,
			maxRetriesPerRequest: this.config.maxRetries,
			lazyConnect: true,
			keepAlive: KEEP_ALIVE_MS,
			connectTimeout: CONNECT_TIMEOUT_MS,
			commandTimeout: COMMAND_TIMEOUT_MS,
			retryStrategy: times => Math.min(1000 * 2 ** times, RECONNECT_MAX_DELAY_MS),
		})

		this.redis.on('ready', () => {
			CorrelatedLogger.log('Redis connection ready', RedisCacheService.name)
			this.metricsService.updateActiveConnections('redis', 1)
		})

		this.redis.on('error', (error: unknown) => {
			this.stats.errors++
			CorrelatedLogger.error(`Redis connection error: ${errorMessage(error)}`, undefined, RedisCacheService.name)
			this.metricsService.updateActiveConnections('redis', 0)
		})

		this.redis.on('close', () => {
			CorrelatedLogger.warn('Redis connection closed', RedisCacheService.name)
			this.metricsService.updateActiveConnections('redis', 0)
		})

		// One explicit connect so dependants (circuit-breaker state restore)
		// see a ready client when Redis is up. If it is not, ioredis keeps
		// reconnecting on its own via retryStrategy — never call connect() again.
		try {
			await this.redis.connect()
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Redis unavailable at startup, ioredis will keep retrying: ${errorMessage(error)}`, RedisCacheService.name)
		}
	}

	async onModuleDestroy(): Promise<void> {
		if (this.redis) {
			await this.redis.quit()
			CorrelatedLogger.log('Redis connection closed', RedisCacheService.name)
		}
	}

	get isConnected(): boolean {
		return this.redis?.status === 'ready'
	}

	/** Returns null (a miss) while disconnected; throws on a command error. */
	async get<T>(key: string): Promise<T | null> {
		if (!this.isConnected) {
			this.stats.misses++
			return null
		}

		this.stats.operations++
		let value: Buffer | null
		try {
			value = await this.redis.getBuffer(key)
		}
		catch (error: unknown) {
			this.stats.errors++
			this.stats.misses++
			throw error
		}

		if (value === null) {
			this.stats.misses++
			return null
		}

		this.stats.hits++
		return this.deserializeValue<T>(value)
	}

	/**
	 * `ttl` in seconds; 0/undefined means the configured `cache.redis.ttl`.
	 * Entries are never written without an expiry.
	 */
	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		if (!this.isConnected) {
			CorrelatedLogger.warn('Redis not connected, skipping SET operation', RedisCacheService.name)
			return
		}

		const effectiveTtl = ttl !== undefined && ttl > 0 ? ttl : this.config.ttl
		if (effectiveTtl <= 0) {
			throw new Error(`[RedisCacheService] Redis TTL must be > 0 — cache.redis.ttl is misconfigured (got ${effectiveTtl})`)
		}

		this.stats.operations++
		try {
			await this.redis.set(key, this.serializeValue(value), 'EX', effectiveTtl)
		}
		catch (error: unknown) {
			this.stats.errors++
			throw error
		}
	}

	async delete(key: string): Promise<void> {
		if (!this.isConnected) {
			CorrelatedLogger.warn('Redis not connected, skipping DELETE operation', RedisCacheService.name)
			return
		}

		this.stats.operations++
		try {
			await this.redis.del(key)
		}
		catch (error: unknown) {
			this.stats.errors++
			throw error
		}
	}

	/**
	 * Remove every image entry (SCAN + DEL). Never FLUSHDB: the database also
	 * holds rate-limit counters and the circuit-breaker state.
	 */
	async clear(): Promise<void> {
		if (!this.isConnected) {
			CorrelatedLogger.warn('Redis not connected, skipping CLEAR operation', RedisCacheService.name)
			return
		}

		this.stats.operations++
		try {
			let deleted = 0
			let cursor = '0'
			do {
				const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', IMAGE_KEY_PATTERN, 'COUNT', SCAN_BATCH)
				cursor = nextCursor
				if (keys.length > 0) {
					await this.redis.del(...keys)
					deleted += keys.length
				}
			} while (cursor !== '0')
			CorrelatedLogger.debug(`Redis cache CLEARED: ${deleted} image keys deleted`, RedisCacheService.name)
		}
		catch (error: unknown) {
			this.stats.errors++
			throw error
		}
	}

	async has(key: string): Promise<boolean> {
		if (!this.isConnected) {
			return false
		}

		this.stats.operations++
		try {
			return (await this.redis.exists(key)) === 1
		}
		catch (error: unknown) {
			this.stats.errors++
			CorrelatedLogger.error(`Redis cache HAS error for key ${key}: ${errorMessage(error)}`, undefined, RedisCacheService.name)
			return false
		}
	}

	async getStats(): Promise<CacheStats> {
		const total = this.stats.hits + this.stats.misses
		const hitRate = total > 0 ? this.stats.hits / total : 0
		this.metricsService.updateCacheHitRatio('redis', hitRate)

		let keys = 0
		let memoryUsage = 0
		if (this.isConnected) {
			try {
				const keyspace = await this.redis.info('keyspace')
				keys = Number.parseInt(keyspace.match(this.keyspaceKeysRe)?.[1] ?? '0', 10)

				const memory = await this.redis.info('memory')
				memoryUsage = Number.parseInt(memory.match(USED_MEMORY_RE)?.[1] ?? '0', 10)
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(`Failed to get Redis info: ${errorMessage(error)}`, RedisCacheService.name)
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

	async ping(): Promise<string> {
		if (!this.isConnected) {
			throw new Error('Redis not connected')
		}
		return this.redis.ping()
	}

	/** Remaining TTL in seconds; -1 when disconnected, unknown, or without expiry. */
	async getTtl(key: string): Promise<number> {
		if (!this.isConnected) {
			return -1
		}

		try {
			return await this.redis.ttl(key)
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Redis TTL error for key ${key}: ${errorMessage(error)}`, undefined, RedisCacheService.name)
			return -1
		}
	}

	/** Raw client for atomic operations (rate-limit Lua, prefix SCANs); null while disconnected. */
	getClient(): Redis | null {
		return this.isConnected ? this.redis : null
	}

	getConnectionStatus(): { connected: boolean, stats: { hits: number, misses: number, operations: number, errors: number } } {
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
			return {
				used: this.extractMemoryValue(info, 'used_memory'),
				peak: this.extractMemoryValue(info, 'used_memory_peak'),
				fragmentation: this.extractMemoryValue(info, 'mem_fragmentation_ratio'),
			}
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Redis memory info error: ${errorMessage(error)}`, undefined, RedisCacheService.name)
			return { used: 0, peak: 0, fragmentation: 0 }
		}
	}

	private extractMemoryValue(info: string, key: string): number {
		const match = info.match(new RegExp(`${key}:(\\d+(?:\\.\\d+)?)`))
		return match ? Number.parseFloat(match[1]) : 0
	}

	/** Objects carrying a `data: Buffer` use the binary envelope; everything else is JSON. */
	private serializeValue<T>(value: T): Buffer {
		if (value && typeof value === 'object' && 'data' in value && Buffer.isBuffer((value as { data: unknown }).data)) {
			const { data, ...rest } = value as { data: Buffer } & Record<string, unknown>
			const metaJson = Buffer.from(JSON.stringify(rest), 'utf8')
			const header = Buffer.alloc(BINARY_HEADER_BYTES)
			header[0] = BINARY_MARKER
			header.writeUInt32BE(metaJson.length, 1)
			return Buffer.concat([header, metaJson, data])
		}
		return Buffer.from(JSON.stringify(value), 'utf8')
	}

	/** The binary envelope's payload is returned as a subarray view — no copy of the image bytes. */
	private deserializeValue<T>(value: Buffer): T | null {
		if (value.length >= BINARY_HEADER_BYTES && value[0] === BINARY_MARKER) {
			const metaLength = value.readUInt32BE(1)
			if (metaLength > 0 && BINARY_HEADER_BYTES + metaLength <= value.length) {
				const rest = JSON.parse(value.toString('utf8', BINARY_HEADER_BYTES, BINARY_HEADER_BYTES + metaLength))
				return { ...rest, data: value.subarray(BINARY_HEADER_BYTES + metaLength) } as T
			}
		}

		try {
			return JSON.parse(value.toString('utf8')) as T
		}
		catch {
			CorrelatedLogger.warn('Failed to deserialize Redis value, returning null', RedisCacheService.name)
			return null
		}
	}
}
