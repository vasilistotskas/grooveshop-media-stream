import type { LayerDistribution, StringMap } from '#microservice/common/types/common.types'
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'

import type { CacheKeyStrategy, CacheLayer, CacheLayerStats } from '../interfaces/cache-layer.interface.js'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Injectable } from '@nestjs/common'
import { FileCacheLayer } from '../layers/file-cache.layer.js'
import { MemoryCacheLayer } from '../layers/memory-cache.layer.js'
import { RedisCacheLayer } from '../layers/redis-cache.layer.js'

import { DefaultCacheKeyStrategy } from '../strategies/cache-key.strategy.js'

export interface MultiLayerCacheStats {
	layers: Record<string, CacheLayerStats>
	totalHits: number
	totalMisses: number
	overallHitRate: number
	layerHitDistribution: LayerDistribution
}

@Injectable()
export class MultiLayerCacheManager implements OnModuleInit, OnModuleDestroy {
	private layers: CacheLayer[] = []
	private keyStrategy: CacheKeyStrategy
	private preloadingEnabled: boolean
	private popularKeys: Map<string, number> = new Map()
	private preloadingInterval?: NodeJS.Timeout

	constructor(
		private readonly _configService: ConfigService,
		private readonly metricsService: MetricsService,
		private readonly memoryCacheLayer: MemoryCacheLayer,
		private readonly redisCacheLayer: RedisCacheLayer,
		private readonly fileCacheLayer: FileCacheLayer,
	) {
		this.keyStrategy = new DefaultCacheKeyStrategy()
		this.preloadingEnabled = this._configService.getOptional('cache.preloading.enabled', false)
	}

	async onModuleInit(): Promise<void> {
		this.layers = [
			this.memoryCacheLayer,
			this.redisCacheLayer,
			this.fileCacheLayer,
		].sort((a: any, b: any) => a.getPriority() - b.getPriority())

		CorrelatedLogger.debug(
			`Multi-layer cache initialized with ${this.layers.length} layers: ${this.layers.map(l => l.getLayerName()).join(', ')}`,
			MultiLayerCacheManager.name,
		)

		if (this.preloadingEnabled) {
			this.startPreloading()
		}
	}

	async onModuleDestroy(): Promise<void> {
		this.stopPreloading()
		CorrelatedLogger.debug('Multi-layer cache manager destroyed', MultiLayerCacheManager.name)
	}

	/**
	 * Get a value from cache using cache-aside pattern with automatic fallback
	 */
	async get<T>(namespace: string, identifier: string, params?: StringMap): Promise<T | null> {
		const key = this.keyStrategy.generateKey(namespace, identifier, params)
		this.trackKeyAccess(key)

		for (const layer of this.layers) {
			try {
				const value = await layer.get<T>(key)
				if (value !== null) {
					CorrelatedLogger.debug(
						`Cache HIT in ${layer.getLayerName()} layer for key: ${key}`,
						MultiLayerCacheManager.name,
					)

					this.metricsService.recordCacheOperation('get', layer.getLayerName(), 'hit')

					await this.backfillLayers(key, value, layer)

					return value
				}
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(
					`Cache layer ${layer.getLayerName()} failed for key ${key}: ${(error as Error).message}`,
					MultiLayerCacheManager.name,
				)
			}
		}

		CorrelatedLogger.debug(`Cache MISS for key: ${key}`, MultiLayerCacheManager.name)
		this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss')

		return null
	}

	/**
	 * Set a value in all cache layers
	 */
	async set<T>(
		namespace: string,
		identifier: string,
		value: T,
		ttl?: number,
		params?: StringMap,
	): Promise<void> {
		const key = this.keyStrategy.generateKey(namespace, identifier, params)

		const setPromises = this.layers.map(async (layer) => {
			try {
				await layer.set(key, value, ttl)
				CorrelatedLogger.debug(
					`Cache SET in ${layer.getLayerName()} layer for key: ${key}`,
					MultiLayerCacheManager.name,
				)
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(
					`Cache SET failed in ${layer.getLayerName()} layer for key ${key}: ${(error as Error).message}`,
					MultiLayerCacheManager.name,
				)
			}
		})

		await Promise.allSettled(setPromises)
		this.metricsService.recordCacheOperation('set', 'multi-layer', 'success')
	}

	/**
	 * Delete a key from all cache layers
	 */
	async delete(namespace: string, identifier: string, params?: StringMap): Promise<void> {
		const key = this.keyStrategy.generateKey(namespace, identifier, params)

		const deletePromises = this.layers.map(async (layer) => {
			try {
				await layer.delete(key)
				CorrelatedLogger.debug(
					`Cache DELETE in ${layer.getLayerName()} layer for key: ${key}`,
					MultiLayerCacheManager.name,
				)
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(
					`Cache DELETE failed in ${layer.getLayerName()} layer for key ${key}: ${(error as Error).message}`,
					MultiLayerCacheManager.name,
				)
			}
		})

		await Promise.allSettled(deletePromises)
		this.popularKeys.delete(key)
		this.metricsService.recordCacheOperation('delete', 'multi-layer', 'success')
	}

	/**
	 * Check if a key exists in any cache layer
	 */
	async exists(namespace: string, identifier: string, params?: StringMap): Promise<boolean> {
		const key = this.keyStrategy.generateKey(namespace, identifier, params)

		for (const layer of this.layers) {
			try {
				if (await layer.exists(key)) {
					return true
				}
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(
					`Cache EXISTS check failed in ${layer.getLayerName()} layer for key ${key}: ${(error as Error).message}`,
					MultiLayerCacheManager.name,
				)
			}
		}

		return false
	}

	/**
	 * Clear all cache layers
	 */
	async clear(): Promise<void> {
		const clearPromises = this.layers.map(async (layer) => {
			try {
				await layer.clear()
				CorrelatedLogger.debug(
					`Cache CLEARED in ${layer.getLayerName()} layer`,
					MultiLayerCacheManager.name,
				)
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(
					`Cache CLEAR failed in ${layer.getLayerName()} layer: ${(error as Error).message}`,
					MultiLayerCacheManager.name,
				)
			}
		})

		await Promise.allSettled(clearPromises)
		this.popularKeys.clear()
		this.metricsService.recordCacheOperation('flush', 'multi-layer', 'success')
	}

	/**
	 * Invalidate keys by namespace
	 */
	async invalidateNamespace(namespace: string): Promise<void> {
		CorrelatedLogger.debug(
			`Invalidating cache namespace: ${namespace}`,
			MultiLayerCacheManager.name,
		)

		await this.clear()
		this.metricsService.recordCacheOperation('flush', 'multi-layer', 'success')
	}

	/**
	 * Get comprehensive cache statistics
	 */
	async getStats(): Promise<MultiLayerCacheStats> {
		const layerStats: Record<string, CacheLayerStats> = {}
		let totalHits = 0
		let totalMisses = 0
		const layerHitDistribution: LayerDistribution = {}

		for (const layer of this.layers) {
			try {
				const stats = await layer.getStats()
				layerStats[layer.getLayerName()] = stats
				totalHits += stats.hits
				totalMisses += stats.misses
				layerHitDistribution[layer.getLayerName()] = stats.hits
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(
					`Failed to get stats from ${layer.getLayerName()} layer: ${(error as Error).message}`,
					MultiLayerCacheManager.name,
				)
				layerStats[layer.getLayerName()] = {
					hits: 0,
					misses: 0,
					keys: 0,
					hitRate: 0,
					errors: 1,
				}
			}
		}

		const totalRequests = totalHits + totalMisses
		const overallHitRate = totalRequests > 0 ? totalHits / totalRequests : 0

		return {
			layers: layerStats,
			totalHits,
			totalMisses,
			overallHitRate,
			layerHitDistribution,
		}
	}

	/**
	 * Preload popular keys into higher priority layers
	 */
	async preloadPopularKeys(): Promise<void> {
		if (!this.preloadingEnabled) {
			return
		}

		const popularKeys = Array.from(this.popularKeys.entries())
			.sort(([, a], [, b]) => b - a)
			.slice(0, 100)
			.map(([key]) => key)

		CorrelatedLogger.debug(
			`Preloading ${popularKeys.length} popular keys`,
			MultiLayerCacheManager.name,
		)

		for (const key of popularKeys) {
			try {
				for (let i = this.layers.length - 1; i >= 0; i--) {
					const value = await this.layers[i].get(key)
					if (value !== null) {
						for (let j = 0; j < i; j++) {
							await this.layers[j].set(key, value)
						}
						break
					}
				}
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(
					`Failed to preload key ${key}: ${(error as Error).message}`,
					MultiLayerCacheManager.name,
				)
			}
		}
	}

	/**
	 * Backfill higher priority layers when a cache hit occurs in a lower priority layer
	 */
	private async backfillLayers<T>(key: string, value: T, sourceLayer: CacheLayer): Promise<void> {
		const sourceIndex = this.layers.findIndex(layer => layer === sourceLayer)
		if (sourceIndex <= 0) {
			return
		}

		const backfillPromises = this.layers.slice(0, sourceIndex).map(async (layer) => {
			try {
				await layer.set(key, value, undefined)
				CorrelatedLogger.debug(
					`Backfilled ${layer.getLayerName()} layer with key: ${key}`,
					MultiLayerCacheManager.name,
				)
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(
					`Failed to backfill ${layer.getLayerName()} layer for key ${key}: ${(error as Error).message}`,
					MultiLayerCacheManager.name,
				)
			}
		})

		await Promise.allSettled(backfillPromises)
	}

	/**
	 * Track key access frequency for preloading
	 */
	private trackKeyAccess(key: string): void {
		if (!this.preloadingEnabled) {
			return
		}

		const currentCount = this.popularKeys.get(key) || 0
		this.popularKeys.set(key, currentCount + 1)

		if (this.popularKeys.size > 10000) {
			const entries = Array.from(this.popularKeys.entries())
				.sort(([, a], [, b]) => b - a)
				.slice(0, 5000)

			this.popularKeys.clear()
			entries.forEach(([k, v]) => this.popularKeys.set(k, v))
		}
	}

	/**
	 * Start periodic preloading
	 */
	private startPreloading(): void {
		const interval = this._configService.getOptional('cache.preloading.interval', 300000)

		this.preloadingInterval = setInterval(async () => {
			try {
				await this.preloadPopularKeys()
			}
			catch (error: unknown) {
				CorrelatedLogger.error(
					`Preloading failed: ${(error as Error).message}`,
					(error as Error).stack,
					MultiLayerCacheManager.name,
				)
			}
		}, interval)

		CorrelatedLogger.debug(
			`Cache preloading started with ${interval}ms interval`,
			MultiLayerCacheManager.name,
		)
	}

	/**
	 * Stop periodic preloading
	 */
	private stopPreloading(): void {
		if (this.preloadingInterval) {
			clearInterval(this.preloadingInterval)
			this.preloadingInterval = undefined
			CorrelatedLogger.debug('Cache preloading stopped', MultiLayerCacheManager.name)
		}
	}
}
