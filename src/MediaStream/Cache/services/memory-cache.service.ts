import type { MemoryCacheConfig } from '#microservice/Config/interfaces/app-config.interface'
import type { CacheStats, ICacheManager } from '../interfaces/cache-manager.interface.js'
import { Buffer } from 'node:buffer'
import { Injectable } from '@nestjs/common'
import NodeCache from 'node-cache'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { keyNamespacePrefix } from '../utils/cache-namespace.util.js'

@Injectable()
export class MemoryCacheService implements ICacheManager {
	protected readonly cache: NodeCache
	private readonly maxByteSize: number
	// Mirrors the NodeCache maxKeys ceiling so eviction can act on key
	// COUNT as well as bytes — node-cache throws ECACHEFULL at the
	// count limit, which the byte budget never reaches for typical
	// image payloads.
	private readonly maxKeys: number
	private currentByteSize = 0
	private readonly sizeMap = new Map<string, number>()

	constructor(
		private readonly _configService: ConfigService,
		private readonly metricsService: MetricsService,
	) {
		const config = this._configService.get<MemoryCacheConfig>('cache.memory')
		this.maxByteSize = config.maxSize
		this.maxKeys = config.maxKeys

		this.cache = new NodeCache({
			stdTTL: config.defaultTtl,
			checkperiod: config.checkPeriod,
			useClones: false,
			deleteOnExpire: true,
			maxKeys: this.maxKeys,
		})

		// Per-operation metrics are recorded once by MultiLayerCacheManager;
		// expiry is the one event only this layer can observe.
		this.cache.on('del', (key: string) => {
			this.trackRemoval(key)
		})

		this.cache.on('expired', (key: string) => {
			this.trackRemoval(key)
			this.metricsService.recordCacheOperation('expire', 'memory', 'success')
		})

		this.cache.on('flush', () => {
			this.currentByteSize = 0
			this.sizeMap.clear()
		})
	}

	async get<T>(key: string): Promise<T | null> {
		const value = this.cache.get<T>(key)
		return value !== undefined ? value : null
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		try {
			const valueSize = this.estimateSize(value)

			// If this single item exceeds the max, skip caching it
			if (valueSize > this.maxByteSize) {
				CorrelatedLogger.warn(`Value too large for memory cache (${valueSize} bytes > ${this.maxByteSize} bytes): ${key}`, MemoryCacheService.name)
				return
			}

			// Remove the existing entry's accounting if overwriting.
			// Delete the sizeMap row too: leaving it meant a later
			// delete/expire subtracted the same bytes a SECOND time, and
			// repeated often enough currentByteSize went negative — at
			// which point evictIfNeeded early-returns forever and the
			// byte ceiling stops being enforced entirely.
			if (this.sizeMap.has(key)) {
				this.currentByteSize -= this.sizeMap.get(key)!
				this.sizeMap.delete(key)
			}

			// Evict entries until we have space
			this.evictIfNeeded(valueSize, key)

			const success = ttl !== undefined ? this.cache.set(key, value, ttl) : this.cache.set(key, value)
			if (success) {
				this.currentByteSize += valueSize
				this.sizeMap.set(key, valueSize)
			}
			else {
				throw new Error(`Failed to set memory cache key: ${key}`)
			}
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Memory cache SET error for key ${key}: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, MemoryCacheService.name)
			throw error
		}
	}

	async delete(key: string): Promise<void> {
		this.cache.del(key)
	}

	async clear(): Promise<void> {
		this.cache.flushAll()
	}

	async getStats(): Promise<CacheStats> {
		const stats = this.cache.getStats()
		const hitRate = stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0

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

	async has(key: string): Promise<boolean> {
		return this.cache.has(key)
	}

	async keys(): Promise<string[]> {
		return this.cache.keys()
	}

	getTtl(key: string): number {
		return this.cache.getTtl(key) ?? 0
	}

	getMemoryUsage(): { used: number, total: number } {
		return {
			used: this.currentByteSize,
			total: this.maxByteSize,
		}
	}

	/**
	 * Estimate the byte size of a value for memory tracking.
	 * For objects with Buffer data fields (cached images), uses buffer.length.
	 * For other values, uses a rough JSON string length estimate.
	 */
	private estimateSize(value: unknown): number {
		if (value === null || value === undefined) {
			return 0
		}

		if (Buffer.isBuffer(value)) {
			return value.length
		}

		if (typeof value === 'object' && value !== null) {
			// Image cache entries: { data: Buffer, metadata: {...} }
			const maybeImage = value as { data?: unknown }
			if (maybeImage.data !== undefined && Buffer.isBuffer(maybeImage.data)) {
				return maybeImage.data.length + 512 // Buffer + estimated metadata overhead
			}

			// For other objects, rough estimate via JSON serialization
			try {
				return JSON.stringify(value).length * 2 // 2 bytes per char (JS strings are UTF-16)
			}
			catch {
				return 1024 // Fallback estimate
			}
		}

		if (typeof value === 'string') {
			return value.length * 2
		}

		return 64 // Default for primitives
	}

	/**
	 * Evict entries until we have enough space for the new value.
	 *
	 * Fairness policy: the WRITER's own namespace is evicted first
	 * (TTL-ascending), and only when that is exhausted does eviction
	 * fall back to the global TTL order. Without this, one hot tenant
	 * flooding the shared byte budget evicted every other tenant's
	 * entries — the aggressor pays for its own pressure first.
	 */
	private evictIfNeeded(requiredSpace: number, forKey?: string): void {
		const allKeys = this.cache.keys()

		// node-cache throws ECACHEFULL once stats.keys reaches maxKeys —
		// including on overwrite — so the key COUNT is a hard wall, not
		// just the byte budget. Image entries are written with the
		// 180-day private TTL, so nothing expires out on its own: at
		// typical processed-webp sizes the pod hits 1000 keys well under
		// the 100MB budget, every later set throws (swallowed one layer
		// up as a warn), and whichever tenant warmed the pod first owns
		// the entire memory tier for the pod's lifetime. That is exactly
		// the noisy-neighbour outcome the fairness ordering below exists
		// to prevent, so count pressure has to trigger it too.
		const overKeyLimit = allKeys.length >= this.maxKeys
		if (
			!overKeyLimit
			&& this.currentByteSize + requiredSpace <= this.maxByteSize
		) {
			return
		}

		if (allKeys.length === 0) {
			return
		}

		// Sort by TTL ascending (soonest to expire first)
		// getTtl() returns absolute expiry timestamp in ms, or undefined for no-expiry keys
		// No-expiry keys should be evicted LAST, so use Infinity
		const keysByTtl = allKeys
			.map(key => ({ key, ttl: this.cache.getTtl(key) ?? Infinity }))
			.sort((a, b) => a.ttl - b.ttl)

		const ownPrefix = forKey ? keyNamespacePrefix(forKey) : null
		const ordered = ownPrefix
			? [
					...keysByTtl.filter(e => e.key.startsWith(ownPrefix)),
					...keysByTtl.filter(e => !e.key.startsWith(ownPrefix)),
				]
			: keysByTtl

		// Free one slot beyond the limit so the pending set has room.
		const keysToFree = overKeyLimit
			? allKeys.length - this.maxKeys + 1
			: 0

		let evicted = 0
		for (const { key } of ordered) {
			const bytesOk
				= this.currentByteSize + requiredSpace <= this.maxByteSize
			if (bytesOk && evicted >= keysToFree) {
				break
			}

			this.cache.del(key)
			evicted++
		}

		if (evicted > 0) {
			CorrelatedLogger.debug(`Evicted ${evicted} entries to free memory (current: ${this.currentByteSize}, max: ${this.maxByteSize})`, MemoryCacheService.name)
		}
	}

	/**
	 * Track removal of a key from the size map.
	 */
	private trackRemoval(key: string): void {
		const size = this.sizeMap.get(key)
		if (size !== undefined) {
			this.currentByteSize -= size
			this.sizeMap.delete(key)
		}
	}
}
