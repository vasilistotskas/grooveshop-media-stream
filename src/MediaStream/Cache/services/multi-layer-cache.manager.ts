import type { OnModuleInit } from '@nestjs/common'
import type { LayerDistribution } from '#microservice/common/types/common.types'
import type { CacheLayer, CacheLayerStats } from '../interfaces/cache-layer.interface.js'
import { Injectable } from '@nestjs/common'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { MemoryCacheLayer } from '../layers/memory-cache.layer.js'
import { RedisCacheLayer } from '../layers/redis-cache.layer.js'
import { cacheKey, tenantFromNamespace } from '../utils/cache-namespace.util.js'

export interface MultiLayerCacheStats {
	layers: Record<string, CacheLayerStats>
	totalHits: number
	totalMisses: number
	overallHitRate: number
	layerHitDistribution: LayerDistribution
}

/**
 * Memory → Redis, checked in priority order; first hit wins and is backfilled
 * into the faster layers. This class is the only place that records
 * `mediastream_cache_operations_total` for the layered tier, so every logical
 * get/set/delete produces exactly one sample per layer probed.
 */
@Injectable()
export class MultiLayerCacheManager implements OnModuleInit {
	private layers: CacheLayer[] = []

	constructor(
		private readonly metricsService: MetricsService,
		private readonly memoryCacheLayer: MemoryCacheLayer,
		private readonly redisCacheLayer: RedisCacheLayer,
	) {}

	onModuleInit(): void {
		this.layers = [this.memoryCacheLayer, this.redisCacheLayer]
			.sort((a, b) => a.getPriority() - b.getPriority())

		CorrelatedLogger.debug(
			`Multi-layer cache initialized with ${this.layers.length} layers: ${this.layers.map(layer => layer.getLayerName()).join(', ')}`,
			MultiLayerCacheManager.name,
		)
	}

	async get<T>(namespace: string, identifier: string): Promise<T | null> {
		const key = cacheKey(namespace, identifier)
		const tenant = tenantFromNamespace(namespace)

		for (const layer of this.layers) {
			try {
				const value = await layer.get<T>(key)
				if (value !== null) {
					CorrelatedLogger.debug(`Cache HIT in ${layer.getLayerName()} layer for key: ${key}`, MultiLayerCacheManager.name)
					this.metricsService.recordCacheOperation('get', layer.getLayerName(), 'hit', undefined, tenant)

					this.backfillLayers(key, value, layer).catch((error: unknown) => {
						CorrelatedLogger.warn(`Backfill failed for key ${key}: ${errorMessage(error)}`, MultiLayerCacheManager.name)
					})

					return value
				}
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(`Cache layer ${layer.getLayerName()} failed for key ${key}: ${errorMessage(error)}`, MultiLayerCacheManager.name)
				this.metricsService.recordCacheOperation('get', layer.getLayerName(), 'error', undefined, tenant)
			}
		}

		CorrelatedLogger.debug(`Cache MISS for key: ${key}`, MultiLayerCacheManager.name)
		this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss', undefined, tenant)

		return null
	}

	/** Write to every layer; one layer failing never blocks the others. */
	async set<T>(namespace: string, identifier: string, value: T, ttl?: number): Promise<void> {
		const key = cacheKey(namespace, identifier)
		const tenant = tenantFromNamespace(namespace)

		await Promise.all(this.layers.map(async (layer) => {
			try {
				await layer.set(key, value, ttl)
				CorrelatedLogger.debug(`Cache SET in ${layer.getLayerName()} layer for key: ${key}`, MultiLayerCacheManager.name)
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(`Cache SET failed in ${layer.getLayerName()} layer for key ${key}: ${errorMessage(error)}`, MultiLayerCacheManager.name)
				this.metricsService.recordCacheOperation('set', layer.getLayerName(), 'error', undefined, tenant)
			}
		}))

		this.metricsService.recordCacheOperation('set', 'multi-layer', 'success', undefined, tenant)
	}

	async delete(namespace: string, identifier: string): Promise<void> {
		const key = cacheKey(namespace, identifier)
		const tenant = tenantFromNamespace(namespace)

		await Promise.all(this.layers.map(async (layer) => {
			try {
				await layer.delete(key)
				CorrelatedLogger.debug(`Cache DELETE in ${layer.getLayerName()} layer for key: ${key}`, MultiLayerCacheManager.name)
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(`Cache DELETE failed in ${layer.getLayerName()} layer for key ${key}: ${errorMessage(error)}`, MultiLayerCacheManager.name)
			}
		}))

		this.metricsService.recordCacheOperation('delete', 'multi-layer', 'success', undefined, tenant)
	}

	async exists(namespace: string, identifier: string): Promise<boolean> {
		const key = cacheKey(namespace, identifier)

		for (const layer of this.layers) {
			try {
				if (await layer.exists(key)) {
					return true
				}
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(`Cache EXISTS check failed in ${layer.getLayerName()} layer for key ${key}: ${errorMessage(error)}`, MultiLayerCacheManager.name)
			}
		}

		return false
	}

	async clear(): Promise<void> {
		await Promise.all(this.layers.map(async (layer) => {
			try {
				await layer.clear()
				CorrelatedLogger.debug(`Cache CLEARED in ${layer.getLayerName()} layer`, MultiLayerCacheManager.name)
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(`Cache CLEAR failed in ${layer.getLayerName()} layer: ${errorMessage(error)}`, MultiLayerCacheManager.name)
			}
		}))

		this.metricsService.recordCacheOperation('flush', 'multi-layer', 'success')
	}

	/** Delete every key under a namespace (`image:acme` → `image:acme:*`) in every layer. */
	async invalidateNamespace(namespace: string): Promise<void> {
		const prefix = cacheKey(namespace, '')
		CorrelatedLogger.debug(`Invalidating cache namespace: ${namespace} (prefix: ${prefix})`, MultiLayerCacheManager.name)

		let totalDeleted = 0
		for (const layer of this.layers) {
			try {
				totalDeleted += await layer.deleteByPrefix(prefix)
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(`Failed to invalidate namespace in ${layer.getLayerName()}: ${errorMessage(error)}`, MultiLayerCacheManager.name)
			}
		}

		CorrelatedLogger.debug(`Namespace ${namespace} invalidated: ${totalDeleted} keys deleted`, MultiLayerCacheManager.name)
		this.metricsService.recordCacheOperation('clear', 'multi-layer', 'success', undefined, tenantFromNamespace(namespace))
	}

	async getStats(): Promise<MultiLayerCacheStats> {
		const layerStats: Record<string, CacheLayerStats> = {}
		const layerHitDistribution: LayerDistribution = {}
		let totalHits = 0
		let totalMisses = 0

		for (const layer of this.layers) {
			try {
				const stats = await layer.getStats()
				layerStats[layer.getLayerName()] = stats
				layerHitDistribution[layer.getLayerName()] = stats.hits
				totalHits += stats.hits
				totalMisses += stats.misses
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(`Failed to get stats from ${layer.getLayerName()} layer: ${errorMessage(error)}`, MultiLayerCacheManager.name)
				layerStats[layer.getLayerName()] = { hits: 0, misses: 0, keys: 0, hitRate: 0, errors: 1 }
			}
		}

		const totalRequests = totalHits + totalMisses

		return {
			layers: layerStats,
			totalHits,
			totalMisses,
			overallHitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
			layerHitDistribution,
		}
	}

	/**
	 * Copy a lower-layer hit into every faster layer, capped at the source's
	 * remaining TTL so a backfilled entry never outlives its origin.
	 */
	private async backfillLayers<T>(key: string, value: T, sourceLayer: CacheLayer): Promise<void> {
		const sourceIndex = this.layers.indexOf(sourceLayer)
		if (sourceIndex <= 0) {
			return
		}

		let remainingTtl: number | undefined
		try {
			const ttl = await sourceLayer.getTtl(key)
			if (ttl > 0) {
				remainingTtl = ttl
			}
		}
		catch {
			// Unknown TTL: the layer default applies
		}

		await Promise.all(this.layers.slice(0, sourceIndex).map(async (layer) => {
			try {
				await layer.set(key, value, remainingTtl)
				CorrelatedLogger.debug(`Backfilled ${layer.getLayerName()} layer with key: ${key} (TTL: ${remainingTtl ?? 'default'}s)`, MultiLayerCacheManager.name)
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(`Failed to backfill ${layer.getLayerName()} layer for key ${key}: ${errorMessage(error)}`, MultiLayerCacheManager.name)
			}
		}))
	}
}
