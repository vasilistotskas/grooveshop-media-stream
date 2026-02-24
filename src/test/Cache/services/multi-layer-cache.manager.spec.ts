import type { CacheLayer, CacheLayerStats } from '#microservice/Cache/interfaces/cache-layer.interface'
import type { MockedObject } from 'vitest'
import { MemoryCacheLayer } from '#microservice/Cache/layers/memory-cache.layer'
import { RedisCacheLayer } from '#microservice/Cache/layers/redis-cache.layer'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { ConfigService } from '#microservice/Config/config.service'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'reflect-metadata'

/**
 * Unit tests for MultiLayerCacheManager.
 * Uses mock CacheLayer implementations to test logic in isolation.
 */

function createMockLayer(name: string, priority: number): MockedObject<CacheLayer> {
	return {
		get: vi.fn().mockResolvedValue(null),
		set: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
		exists: vi.fn().mockResolvedValue(false),
		deleteByPrefix: vi.fn().mockResolvedValue(0),
		clear: vi.fn().mockResolvedValue(undefined),
		getStats: vi.fn().mockResolvedValue({
			hits: 0,
			misses: 0,
			keys: 0,
			hitRate: 0,
			errors: 0,
		} as CacheLayerStats),
		getLayerName: vi.fn().mockReturnValue(name),
		getPriority: vi.fn().mockReturnValue(priority),
	} as any
}

describe('multiLayerCacheManager Unit', () => {
	let manager: MultiLayerCacheManager
	let mockConfigService: MockedObject<ConfigService>
	let mockMetricsService: MockedObject<MetricsService>
	let mockMemoryLayer: MockedObject<CacheLayer>
	let mockRedisLayer: MockedObject<CacheLayer>

	beforeEach(async () => {
		mockConfigService = {
			get: vi.fn(),
			getOptional: vi.fn().mockReturnValue(false),
		} as any

		mockMetricsService = {
			recordCacheOperation: vi.fn(),
		} as any

		mockMemoryLayer = createMockLayer('memory', 1)
		mockRedisLayer = createMockLayer('redis', 2)

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MultiLayerCacheManager,
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: MetricsService, useValue: mockMetricsService },
				{ provide: MemoryCacheLayer, useValue: mockMemoryLayer },
				{ provide: RedisCacheLayer, useValue: mockRedisLayer },
			],
		}).compile()

		manager = module.get<MultiLayerCacheManager>(MultiLayerCacheManager)
		await manager.onModuleInit()
	})

	afterEach(async () => {
		await manager.onModuleDestroy()
		vi.clearAllMocks()
	})

	describe('get - Sequential Layer Lookup', () => {
		it('should return value from first layer and stop', async () => {
			const testValue = { data: 'from-memory' }
			mockMemoryLayer.get.mockResolvedValue(testValue)

			const result = await manager.get('image', 'key1')

			expect(result).toEqual(testValue)
			expect(mockMemoryLayer.get).toHaveBeenCalledWith('image:key1')
			expect(mockRedisLayer.get).not.toHaveBeenCalled()
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'memory', 'hit')
		})

		it('should fall through to second layer when first misses', async () => {
			const testValue = { data: 'from-redis' }
			mockMemoryLayer.get.mockResolvedValue(null)
			mockRedisLayer.get.mockResolvedValue(testValue)

			const result = await manager.get('image', 'key1')

			expect(result).toEqual(testValue)
			expect(mockMemoryLayer.get).toHaveBeenCalled()
			expect(mockRedisLayer.get).toHaveBeenCalled()
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'redis', 'hit')
		})

		it('should record miss when all layers miss', async () => {
			mockMemoryLayer.get.mockResolvedValue(null)
			mockRedisLayer.get.mockResolvedValue(null)

			const result = await manager.get('image', 'key1')

			expect(result).toBeNull()
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'miss')
		})

		it('should skip failing layer and continue to next', async () => {
			const testValue = { data: 'from-redis' }
			mockMemoryLayer.get.mockRejectedValue(new Error('Memory error'))
			mockRedisLayer.get.mockResolvedValue(testValue)

			const result = await manager.get('image', 'key1')

			expect(result).toEqual(testValue)
			expect(mockRedisLayer.get).toHaveBeenCalled()
		})

		it('should return null when all layers fail', async () => {
			mockMemoryLayer.get.mockRejectedValue(new Error('Memory error'))
			mockRedisLayer.get.mockRejectedValue(new Error('Redis error'))

			const result = await manager.get('image', 'key1')

			expect(result).toBeNull()
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'miss')
		})
	})

	describe('get - Backfill Behavior', () => {
		it('should backfill higher-priority layer when hit in lower layer', async () => {
			const testValue = { data: 'from-redis' }
			mockMemoryLayer.get.mockResolvedValue(null)
			mockRedisLayer.get.mockResolvedValue(testValue)

			await manager.get('image', 'key1')

			// Wait for fire-and-forget backfill
			await new Promise(resolve => setTimeout(resolve, 50))

			expect(mockMemoryLayer.set).toHaveBeenCalledWith('image:key1', testValue, undefined)
		})

		it('should NOT backfill when hit in highest-priority layer', async () => {
			const testValue = { data: 'from-memory' }
			mockMemoryLayer.get.mockResolvedValue(testValue)

			await manager.get('image', 'key1')

			await new Promise(resolve => setTimeout(resolve, 50))

			expect(mockMemoryLayer.set).not.toHaveBeenCalled()
			expect(mockRedisLayer.set).not.toHaveBeenCalled()
		})

		it('should not crash when backfill fails', async () => {
			const testValue = { data: 'from-redis' }
			mockMemoryLayer.get.mockResolvedValue(null)
			mockRedisLayer.get.mockResolvedValue(testValue)
			mockMemoryLayer.set.mockRejectedValue(new Error('Backfill failed'))

			const result = await manager.get('image', 'key1')

			// Should still return the value even if backfill fails
			expect(result).toEqual(testValue)

			// Wait for backfill to settle
			await new Promise(resolve => setTimeout(resolve, 50))
		})
	})

	describe('set - Write to All Layers', () => {
		it('should write to all layers', async () => {
			await manager.set('image', 'key1', { data: 'test' }, 3600)

			expect(mockMemoryLayer.set).toHaveBeenCalledWith('image:key1', { data: 'test' }, 3600)
			expect(mockRedisLayer.set).toHaveBeenCalledWith('image:key1', { data: 'test' }, 3600)
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'multi-layer', 'success')
		})

		it('should still succeed if one layer fails during set', async () => {
			mockRedisLayer.set.mockRejectedValue(new Error('Redis write error'))

			await manager.set('image', 'key1', { data: 'test' })

			// Should not throw, memory layer still succeeds
			expect(mockMemoryLayer.set).toHaveBeenCalled()
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'multi-layer', 'success')
		})
	})

	describe('delete - Remove from All Layers', () => {
		it('should delete from all layers', async () => {
			await manager.delete('image', 'key1')

			expect(mockMemoryLayer.delete).toHaveBeenCalledWith('image:key1')
			expect(mockRedisLayer.delete).toHaveBeenCalledWith('image:key1')
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('delete', 'multi-layer', 'success')
		})

		it('should succeed if one layer fails during delete', async () => {
			mockMemoryLayer.delete.mockRejectedValue(new Error('Memory delete error'))

			await manager.delete('image', 'key1')

			expect(mockRedisLayer.delete).toHaveBeenCalled()
		})
	})

	describe('exists - Check Layers Sequentially', () => {
		it('should return true if any layer has the key', async () => {
			mockMemoryLayer.exists.mockResolvedValue(false)
			mockRedisLayer.exists.mockResolvedValue(true)

			const result = await manager.exists('image', 'key1')

			expect(result).toBe(true)
		})

		it('should return false if no layer has the key', async () => {
			mockMemoryLayer.exists.mockResolvedValue(false)
			mockRedisLayer.exists.mockResolvedValue(false)

			const result = await manager.exists('image', 'key1')

			expect(result).toBe(false)
		})

		it('should skip failing layer and check next', async () => {
			mockMemoryLayer.exists.mockRejectedValue(new Error('Memory error'))
			mockRedisLayer.exists.mockResolvedValue(true)

			const result = await manager.exists('image', 'key1')

			expect(result).toBe(true)
		})
	})

	describe('clear - Clear All Layers', () => {
		it('should clear all layers', async () => {
			await manager.clear()

			expect(mockMemoryLayer.clear).toHaveBeenCalled()
			expect(mockRedisLayer.clear).toHaveBeenCalled()
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('flush', 'multi-layer', 'success')
		})

		it('should handle layer failures during clear', async () => {
			mockMemoryLayer.clear.mockRejectedValue(new Error('Clear failed'))

			await manager.clear()

			expect(mockRedisLayer.clear).toHaveBeenCalled()
		})
	})

	describe('invalidateNamespace', () => {
		it('should call deleteByPrefix on all layers', async () => {
			mockMemoryLayer.deleteByPrefix.mockResolvedValue(5)
			mockRedisLayer.deleteByPrefix.mockResolvedValue(3)

			await manager.invalidateNamespace('image')

			expect(mockMemoryLayer.deleteByPrefix).toHaveBeenCalledWith('image:')
			expect(mockRedisLayer.deleteByPrefix).toHaveBeenCalledWith('image:')
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('clear', 'multi-layer', 'success')
		})

		it('should handle layer failures during invalidation', async () => {
			mockMemoryLayer.deleteByPrefix.mockRejectedValue(new Error('Delete error'))
			mockRedisLayer.deleteByPrefix.mockResolvedValue(3)

			// Should not throw
			await manager.invalidateNamespace('image')

			expect(mockRedisLayer.deleteByPrefix).toHaveBeenCalled()
		})
	})

	describe('getStats', () => {
		it('should aggregate stats from all layers', async () => {
			mockMemoryLayer.getStats.mockResolvedValue({
				hits: 100,
				misses: 20,
				keys: 50,
				hitRate: 0.83,
				errors: 0,
			})
			mockRedisLayer.getStats.mockResolvedValue({
				hits: 80,
				misses: 40,
				keys: 60,
				hitRate: 0.67,
				errors: 0,
			})

			const stats = await manager.getStats()

			expect(stats.totalHits).toBe(180)
			expect(stats.totalMisses).toBe(60)
			expect(stats.overallHitRate).toBeCloseTo(0.75)
			expect(stats.layers.memory.hits).toBe(100)
			expect(stats.layers.redis.hits).toBe(80)
			expect(stats.layerHitDistribution.memory).toBe(100)
			expect(stats.layerHitDistribution.redis).toBe(80)
		})

		it('should handle layer stats failures gracefully', async () => {
			mockMemoryLayer.getStats.mockRejectedValue(new Error('Stats error'))
			mockRedisLayer.getStats.mockResolvedValue({
				hits: 50,
				misses: 10,
				keys: 30,
				hitRate: 0.83,
				errors: 0,
			})

			const stats = await manager.getStats()

			expect(stats.layers.memory.errors).toBe(1)
			expect(stats.layers.memory.hits).toBe(0)
			expect(stats.layers.redis.hits).toBe(50)
			expect(stats.totalHits).toBe(50)
			expect(stats.totalMisses).toBe(10)
		})

		it('should handle all layers failing', async () => {
			mockMemoryLayer.getStats.mockRejectedValue(new Error('Memory error'))
			mockRedisLayer.getStats.mockRejectedValue(new Error('Redis error'))

			const stats = await manager.getStats()

			expect(stats.totalHits).toBe(0)
			expect(stats.totalMisses).toBe(0)
			expect(stats.overallHitRate).toBe(0)
			expect(stats.layers.memory.errors).toBe(1)
			expect(stats.layers.redis.errors).toBe(1)
		})
	})

	describe('lifecycle', () => {
		it('should sort layers by priority on init', async () => {
			// Layers are already initialized in beforeEach
			// memory (priority 1) should come before redis (priority 2)
			const result1 = { data: 'memory-hit' }
			mockMemoryLayer.get.mockResolvedValue(result1)

			const result = await manager.get('image', 'key1')
			expect(result).toEqual(result1)
			// Redis should not be called since memory is higher priority
			expect(mockRedisLayer.get).not.toHaveBeenCalled()
		})

		it('should handle onModuleDestroy cleanly', async () => {
			// Should not throw
			await expect(manager.onModuleDestroy()).resolves.not.toThrow()
		})
	})
})
