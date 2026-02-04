import type { MockedObject } from 'vitest'
import { FileCacheLayer } from '#microservice/Cache/layers/file-cache.layer'
import { MemoryCacheLayer } from '#microservice/Cache/layers/memory-cache.layer'
import { RedisCacheLayer } from '#microservice/Cache/layers/redis-cache.layer'
import { MemoryCacheService } from '#microservice/Cache/services/memory-cache.service'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { ConfigService } from '#microservice/Config/config.service'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'reflect-metadata'

describe('multiLayerCacheManager Integration', () => {
	let cacheManager: MultiLayerCacheManager
	let mockConfigService: MockedObject<ConfigService>
	let mockMetricsService: MockedObject<MetricsService>
	let mockMemoryCacheService: MockedObject<MemoryCacheService>
	let mockRedisCacheService: MockedObject<RedisCacheService>

	beforeEach(async () => {
		mockConfigService = {
			get: vi.fn(),
			getOptional: vi.fn(),
		} as any

		mockMetricsService = {
			recordCacheOperation: vi.fn(),
		} as any

		mockMemoryCacheService = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			has: vi.fn(),
			clear: vi.fn(),
			getStats: vi.fn(),
		} as any

		mockRedisCacheService = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			has: vi.fn(),
			clear: vi.fn(),
			getStats: vi.fn(),
			getConnectionStatus: vi.fn(),
		} as any

		// Default config values
		mockConfigService.get.mockImplementation((key: string) => {
			switch (key) {
				case 'cache.file.directory':
					return './test-cache'
				default:
					return undefined
			}
		})

		mockConfigService.getOptional.mockImplementation((key: string, defaultValue: any) => {
			switch (key) {
				case 'cache.preloading.enabled':
					return false
				case 'cache.preloading.interval':
					return 300000
				default:
					return defaultValue
			}
		})

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MultiLayerCacheManager,
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
				{
					provide: MetricsService,
					useValue: mockMetricsService,
				},
				{
					provide: MemoryCacheLayer,
					useFactory: () => new MemoryCacheLayer(mockMemoryCacheService),
				},
				{
					provide: RedisCacheLayer,
					useFactory: () => new RedisCacheLayer(mockRedisCacheService),
				},
				{
					provide: FileCacheLayer,
					useFactory: () => new FileCacheLayer(mockConfigService),
				},
			],
		}).compile()

		cacheManager = module.get<MultiLayerCacheManager>(MultiLayerCacheManager)

		// Initialize the cache manager
		await cacheManager.onModuleInit()
	})

	describe('cache-aside Pattern', () => {
		it('should get value from memory cache first', async () => {
			const testValue = { data: 'test' }
			mockMemoryCacheService.get.mockResolvedValue(testValue)
			mockRedisCacheService.get.mockResolvedValue(null)

			const result = await cacheManager.get('images', 'test-key')

			expect(result).toEqual(testValue)
			expect(mockMemoryCacheService.get).toHaveBeenCalledWith('images:test-key')
			// Parallel cache checks now call both layers
			expect(mockRedisCacheService.get).toHaveBeenCalledWith('images:test-key')
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'memory', 'hit')
		})

		it('should fallback to Redis when memory cache misses', async () => {
			const testValue = { data: 'test' }
			mockMemoryCacheService.get.mockResolvedValue(null)
			mockRedisCacheService.get.mockResolvedValue(testValue)
			mockMemoryCacheService.set.mockResolvedValue(undefined)

			const result = await cacheManager.get('images', 'test-key')

			expect(result).toEqual(testValue)
			expect(mockMemoryCacheService.get).toHaveBeenCalledWith('images:test-key')
			expect(mockRedisCacheService.get).toHaveBeenCalledWith('images:test-key')
			expect(mockMemoryCacheService.set).toHaveBeenCalledWith('images:test-key', testValue, undefined)
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'redis', 'hit')
		})

		it('should return null when all layers miss', async () => {
			mockMemoryCacheService.get.mockResolvedValue(null)
			mockRedisCacheService.get.mockResolvedValue(null)

			const result = await cacheManager.get('images', 'test-key')

			expect(result).toBeNull()
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'miss')
		})

		it('should handle layer failures gracefully', async () => {
			const testValue = { data: 'test' }
			mockMemoryCacheService.get.mockRejectedValue(new Error('Memory cache error'))
			mockRedisCacheService.get.mockResolvedValue(testValue)
			mockMemoryCacheService.set.mockResolvedValue(undefined)

			const result = await cacheManager.get('images', 'test-key')

			expect(result).toEqual(testValue)
			expect(mockRedisCacheService.get).toHaveBeenCalled()
		})
	})

	describe('cache Operations', () => {
		it('should set value in all layers', async () => {
			const testValue = { data: 'test' }
			mockMemoryCacheService.set.mockResolvedValue(undefined)
			mockRedisCacheService.set.mockResolvedValue(undefined)

			await cacheManager.set('images', 'test-key', testValue, 3600)

			expect(mockMemoryCacheService.set).toHaveBeenCalledWith('images:test-key', testValue, 3600)
			expect(mockRedisCacheService.set).toHaveBeenCalledWith('images:test-key', testValue, 3600)
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'multi-layer', 'success')
		})

		it('should delete from all layers', async () => {
			mockMemoryCacheService.delete.mockResolvedValue(undefined)
			mockRedisCacheService.delete.mockResolvedValue(undefined)

			await cacheManager.delete('images', 'test-key')

			expect(mockMemoryCacheService.delete).toHaveBeenCalledWith('images:test-key')
			expect(mockRedisCacheService.delete).toHaveBeenCalledWith('images:test-key')
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('delete', 'multi-layer', 'success')
		})

		it('should check existence in priority order', async () => {
			mockMemoryCacheService.has.mockResolvedValue(false)
			mockRedisCacheService.has.mockResolvedValue(true)

			const result = await cacheManager.exists('images', 'test-key')

			expect(result).toBe(true)
			// Both layers are checked in parallel now
			expect(mockMemoryCacheService.has).toHaveBeenCalledWith('images:test-key')
			expect(mockRedisCacheService.has).toHaveBeenCalledWith('images:test-key')
		})

		it('should clear all layers', async () => {
			mockMemoryCacheService.clear.mockResolvedValue(undefined)
			mockRedisCacheService.clear.mockResolvedValue(undefined)

			await cacheManager.clear()

			expect(mockMemoryCacheService.clear).toHaveBeenCalled()
			expect(mockRedisCacheService.clear).toHaveBeenCalled()
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('flush', 'multi-layer', 'success')
		})
	})

	describe('key Generation', () => {
		it('should generate consistent keys', async () => {
			const testValue = { data: 'test' }
			mockMemoryCacheService.get.mockResolvedValue(testValue)

			await cacheManager.get('images', 'test-key', { width: 100, height: 200 })

			// Key should include hashed parameters
			expect(mockMemoryCacheService.get).toHaveBeenCalledWith(
				expect.stringMatching(/^images:test-key:[a-f0-9]{16}$/),
			)
		})

		it('should generate same key for same parameters', async () => {
			const testValue = { data: 'test' }
			mockMemoryCacheService.get.mockResolvedValue(testValue)

			await cacheManager.get('images', 'test-key', { width: 100, height: 200 })
			await cacheManager.get('images', 'test-key', { height: 200, width: 100 }) // Different order

			// Should generate the same key both times
			const calls = mockMemoryCacheService.get.mock.calls
			expect(calls[0][0]).toBe(calls[1][0])
		})
	})

	describe('statistics', () => {
		it('should aggregate stats from all layers', async () => {
			mockMemoryCacheService.getStats.mockResolvedValue({
				hits: 100,
				misses: 20,
				keys: 50,
				ksize: 100,
				vsize: 924,
				hitRate: 0.83,
				memoryUsage: 1024,
			})

			mockRedisCacheService.getStats.mockResolvedValue({
				hits: 80,
				misses: 40,
				keys: 60,
				ksize: 0,
				vsize: 2048,
				hitRate: 0.67,
			})

			mockRedisCacheService.getConnectionStatus.mockReturnValue({
				connected: true,
				stats: { hits: 80, misses: 40, operations: 120, errors: 2 },
			})

			const stats = await cacheManager.getStats()

			expect(stats.totalHits).toBe(180)
			expect(stats.totalMisses).toBe(60)
			expect(stats.overallHitRate).toBeCloseTo(0.75)
			expect(stats.layers.memory.hits).toBe(100)
			expect(stats.layers.redis.hits).toBe(80)
			expect(stats.layerHitDistribution.memory).toBe(100)
			expect(stats.layerHitDistribution.redis).toBe(80)
		})

		it('should handle layer stats failures', async () => {
			mockMemoryCacheService.getStats.mockRejectedValue(new Error('Stats error'))
			mockRedisCacheService.getStats.mockResolvedValue({
				hits: 50,
				misses: 10,
				keys: 30,
				ksize: 0,
				vsize: 1024,
				hitRate: 0.83,
			})
			mockRedisCacheService.getConnectionStatus.mockReturnValue({
				connected: true,
				stats: { hits: 50, misses: 10, operations: 60, errors: 0 },
			})

			const stats = await cacheManager.getStats()

			expect(stats.layers.memory.errors).toBe(1)
			expect(stats.layers.redis.hits).toBe(50)
			expect(stats.totalHits).toBe(50)
		})
	})

	describe('invalidation', () => {
		it('should invalidate namespace by clearing all layers', async () => {
			mockMemoryCacheService.clear.mockResolvedValue(undefined)
			mockRedisCacheService.clear.mockResolvedValue(undefined)

			await cacheManager.invalidateNamespace('images')

			expect(mockMemoryCacheService.clear).toHaveBeenCalled()
			expect(mockRedisCacheService.clear).toHaveBeenCalled()
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('flush', 'multi-layer', 'success')
		})
	})

	describe('backfill Behavior', () => {
		it('should backfill higher priority layers on cache hit', async () => {
			const testValue = { data: 'test' }
			mockMemoryCacheService.get.mockResolvedValue(null)
			mockRedisCacheService.get.mockResolvedValue(testValue)
			mockMemoryCacheService.set.mockResolvedValue(undefined)

			await cacheManager.get('images', 'test-key')

			// Should backfill memory cache
			expect(mockMemoryCacheService.set).toHaveBeenCalledWith('images:test-key', testValue, undefined)
		})

		it('should not backfill when hit is in highest priority layer', async () => {
			const testValue = { data: 'test' }
			mockMemoryCacheService.get.mockResolvedValue(testValue)

			await cacheManager.get('images', 'test-key')

			// Should not call set on any layer
			expect(mockMemoryCacheService.set).not.toHaveBeenCalled()
			expect(mockRedisCacheService.set).not.toHaveBeenCalled()
		})
	})
})
