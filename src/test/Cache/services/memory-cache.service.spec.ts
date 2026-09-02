import type { MockedObject } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCacheService } from '#microservice/Cache/services/memory-cache.service'
import { ConfigService } from '#microservice/Config/config.service'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

describe('memoryCacheService', () => {
	let service: MemoryCacheService
	let configService: MockedObject<ConfigService>
	let metricsService: MockedObject<MetricsService>

	beforeEach(async () => {
		const mockConfigService = createConfigServiceMock()

		const mockMetricsService = {
			recordCacheOperation: vi.fn(),
			updateCacheHitRatio: vi.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MemoryCacheService,
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
				{
					provide: MetricsService,
					useValue: mockMetricsService,
				},
			],
		}).compile()

		service = module.get<MemoryCacheService>(MemoryCacheService)
		configService = module.get(ConfigService)
		metricsService = module.get(MetricsService)
	})

	afterEach(async () => {
		await service.clear()
		vi.clearAllMocks()
	})

	describe('basic Cache Operations', () => {
		it('should be defined', () => {
			expect(service).toBeDefined()
		})

		it('should set and get a value', async () => {
			const key = 'test-key'
			const value = { data: 'test-value', timestamp: Date.now() }

			await service.set(key, value)
			const result = await service.get(key)

			expect(result).toEqual(value)
		})

		it('should return null for non-existent key', async () => {
			const result = await service.get('non-existent-key')
			expect(result).toBeNull()
		})

		it('should delete a key', async () => {
			const key = 'test-key'
			const value = 'test-value'

			await service.set(key, value)
			await service.delete(key)
			const result = await service.get(key)

			expect(result).toBeNull()
		})

		it('should check if key exists', async () => {
			const key = 'test-key'
			const value = 'test-value'

			expect(await service.has(key)).toBe(false)

			await service.set(key, value)
			expect(await service.has(key)).toBe(true)

			await service.delete(key)
			expect(await service.has(key)).toBe(false)
		})

		it('should clear all keys', async () => {
			await service.set('key1', 'value1')
			await service.set('key2', 'value2')

			await service.clear()

			expect(await service.get('key1')).toBeNull()
			expect(await service.get('key2')).toBeNull()
		})

		it('should get all keys', async () => {
			await service.set('key1', 'value1')
			await service.set('key2', 'value2')

			const keys = await service.keys()

			expect(keys).toContain('key1')
			expect(keys).toContain('key2')
			expect(keys).toHaveLength(2)
		})
	})

	describe('tTL Operations', () => {
		it('should set value with custom TTL', async () => {
			const key = 'ttl-test'
			const value = 'test-value'
			const ttl = 1 // 1 second

			vi.useFakeTimers()
			try {
				await service.set(key, value, ttl)
				expect(await service.get(key)).toBe(value)

				// node-cache checks expiry against Date.now(), which fake timers advance
				vi.advanceTimersByTime(1100)
				expect(await service.get(key)).toBeNull()
			}
			finally {
				vi.useRealTimers()
			}
		})

		it('should get TTL for a key', async () => {
			const key = 'ttl-test'
			const value = 'test-value'
			const ttl = 3600

			await service.set(key, value, ttl)
			const keyTtl = service.getTtl(key)

			// NodeCache getTtl returns a timestamp, so it should be greater than current time
			expect(keyTtl).toBeGreaterThan(Date.now())
			// And should be within the expected TTL range (current time + ttl seconds)
			expect(keyTtl).toBeLessThanOrEqual(Date.now() + (ttl * 1000))
		})
	})

	describe('statistics', () => {
		it('should return cache statistics', async () => {
			await service.set('key1', 'value1')
			await service.set('key2', 'value2')
			await service.get('key1') // Hit
			await service.get('key3') // Miss

			const stats = await service.getStats()

			expect(stats).toHaveProperty('hits')
			expect(stats).toHaveProperty('misses')
			expect(stats).toHaveProperty('keys')
			expect(stats).toHaveProperty('hitRate')
			expect(stats.keys).toBe(2)
			expect(metricsService.updateCacheHitRatio).toHaveBeenCalledWith('memory', expect.any(Number))
		})

		it('should calculate hit rate correctly', async () => {
			await service.set('key1', 'value1')

			// Generate some hits and misses
			await service.get('key1') // Hit
			await service.get('key1') // Hit
			await service.get('key2') // Miss

			const stats = await service.getStats()

			expect(stats.hitRate).toBeCloseTo(0.67, 1) // 2 hits out of 3 requests
		})

		it('should return memory usage information', async () => {
			const memoryUsage = service.getMemoryUsage()

			expect(memoryUsage).toHaveProperty('used')
			expect(memoryUsage).toHaveProperty('total')
			expect(typeof memoryUsage.used).toBe('number')
			expect(typeof memoryUsage.total).toBe('number')
		})
	})

	describe('error Handling', () => {
		it('should propagate get errors', async () => {
			// Mock cache to throw error
			const originalGet = (service as any).cache.get
			;(service as any).cache.get = vi.fn().mockImplementation(() => {
				throw new Error('Cache error')
			})

			// The layered manager owns error handling and metrics; the layer propagates.
			await expect(service.get('test-key')).rejects.toThrow('Cache error')

			// Restore original method
			;(service as any).cache.get = originalGet
		})

		it('should propagate set errors', async () => {
			// Mock cache to throw error
			const originalSet = (service as any).cache.set
			;(service as any).cache.set = vi.fn().mockImplementation(() => {
				throw new Error('Cache error')
			})

			await expect(service.set('test-key', 'test-value')).rejects.toThrow('Cache error')

			// Restore original method
			;(service as any).cache.set = originalSet
		})

		it('should propagate stats errors', async () => {
			const originalGetStats = (service as any).cache.getStats
			;(service as any).cache.getStats = vi.fn().mockImplementation(() => {
				throw new Error('Stats error')
			})

			await expect(service.getStats()).rejects.toThrow('Stats error')

			;(service as any).cache.getStats = originalGetStats
		})
	})

	describe('configuration', () => {
		it('should use configuration values', () => {
			expect(configService.get).toHaveBeenCalledWith('cache.memory')
		})
	})

	describe('metrics Integration', () => {
		it('should record cache operations in metrics', async () => {
			// Clear any previous calls
			vi.clearAllMocks()

			await service.set('key1', 'value1')
			const value = await service.get('key1') // This should be a hit since we just set it
			await service.delete('key1')
			await service.clear()

			// Per-operation metrics belong to MultiLayerCacheManager; the layer records nothing here.
			expect(metricsService.recordCacheOperation).not.toHaveBeenCalled()
			expect(value).toBe('value1')
		})

		it('should update hit ratio in metrics', async () => {
			await service.getStats()

			expect(metricsService.updateCacheHitRatio).toHaveBeenCalledWith('memory', expect.any(Number))
		})
	})

	describe('tenant-fair eviction', () => {
		it('evicts the writing tenant\'s own entries before other tenants\'', async () => {
			// Tiny budget so a handful of string values force eviction.
			// estimateSize: string → length * 2 bytes.
			const smallModule: TestingModule = await Test.createTestingModule({
				providers: [
					MemoryCacheService,
					{
						provide: ConfigService,
						useValue: createConfigServiceMock({ 'cache.memory.maxSize': 2000 }),
					},
					{
						provide: MetricsService,
						useValue: { recordCacheOperation: vi.fn(), updateCacheHitRatio: vi.fn() },
					},
				],
			}).compile()
			const small = smallModule.get<MemoryCacheService>(MemoryCacheService)

			const payload = 'x'.repeat(300) // 600 bytes each
			await small.set('image:hot:1', payload, 3600)
			await small.set('image:hot:2', payload, 3600)
			await small.set('image:quiet:1', payload, 3600)
			// Budget now 1800/2000 — the next hot write must evict, and it
			// must evict HOT entries (the writer's own namespace), never
			// the quiet tenant's.
			await small.set('image:hot:3', payload, 3600)

			expect(await small.get('image:quiet:1')).toBe(payload)
			expect(await small.get('image:hot:3')).toBe(payload)
			const hot1 = await small.get('image:hot:1')
			const hot2 = await small.get('image:hot:2')
			expect([hot1, hot2]).toContain(null)

			await small.clear()
		})
	})
})
