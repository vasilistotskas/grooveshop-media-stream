import { MemoryCacheService } from '@microservice/Cache/services/memory-cache.service'
import { ConfigService } from '@microservice/Config/config.service'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { Test, TestingModule } from '@nestjs/testing'

describe('memoryCacheService', () => {
	let service: MemoryCacheService
	let configService: jest.Mocked<ConfigService>
	let metricsService: jest.Mocked<MetricsService>

	beforeEach(async () => {
		const mockConfigService = {
			get: jest.fn(),
		}

		const mockMetricsService = {
			recordCacheOperation: jest.fn(),
			updateCacheHitRatio: jest.fn(),
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

		// Setup default config
		configService.get.mockImplementation((key: string) => {
			if (key === 'cache.memory') {
				return {
					defaultTtl: 3600,
					checkPeriod: 600,
					maxKeys: 1000,
					maxSize: 100 * 1024 * 1024,
				}
			}
			return undefined
		})
	})

	afterEach(async () => {
		await service.clear()
		jest.clearAllMocks()
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
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'memory', 'success')
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

			await service.set(key, value, ttl)
			expect(await service.get(key)).toBe(value)

			// Wait for expiration
			await new Promise(resolve => setTimeout(resolve, 1100))
			expect(await service.get(key)).toBeNull()
		})

		it('should get TTL for a key', async () => {
			const key = 'ttl-test'
			const value = 'test-value'
			const ttl = 3600

			await service.set(key, value, ttl)
			const keyTtl = service.getTtl(key)

			expect(keyTtl).toBeGreaterThan(0)
			expect(keyTtl).toBeLessThanOrEqual(ttl * 1000) // TTL is in milliseconds
		})

		it('should update TTL for existing key', async () => {
			const key = 'ttl-test'
			const value = 'test-value'

			await service.set(key, value, 3600)
			const success = service.setTtl(key, 7200)

			expect(success).toBe(true)
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
		it('should handle get errors gracefully', async () => {
			// Mock cache to throw error
			const originalGet = service.cache.get
			service.cache.get = jest.fn().mockImplementation(() => {
				throw new Error('Cache error')
			})

			const result = await service.get('test-key')

			expect(result).toBeNull()
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'memory', 'error')

			// Restore original method
			service.cache.get = originalGet
		})

		it('should handle set errors gracefully', async () => {
			// Mock cache to throw error
			const originalSet = service.cache.set
			service.cache.set = jest.fn().mockImplementation(() => {
				throw new Error('Cache error')
			})

			await expect(service.set('test-key', 'test-value')).rejects.toThrow('Cache error')
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'memory', 'error')

			// Restore original method
			service.cache.set = originalSet
		})

		it('should handle stats errors gracefully', async () => {
			// Mock cache to throw error
			const originalGetStats = service.cache.getStats
			service.cache.getStats = jest.fn().mockImplementation(() => {
				throw new Error('Stats error')
			})

			const stats = await service.getStats()

			expect(stats).toEqual({
				hits: 0,
				misses: 0,
				keys: 0,
				ksize: 0,
				vsize: 0,
				hitRate: 0,
			})

			// Restore original method
			service.cache.getStats = originalGetStats
		})
	})

	describe('configuration', () => {
		it('should use configuration values', () => {
			expect(configService.get).toHaveBeenCalledWith('cache.memory')
		})

		it('should handle missing configuration gracefully', async () => {
			configService.get.mockReturnValue(undefined)

			// Create new service instance with missing config
			const module: TestingModule = await Test.createTestingModule({
				providers: [
					MemoryCacheService,
					{
						provide: ConfigService,
						useValue: configService,
					},
					{
						provide: MetricsService,
						useValue: metricsService,
					},
				],
			}).compile()

			const newService = module.get<MemoryCacheService>(MemoryCacheService)
			expect(newService).toBeDefined()
		})
	})

	describe('metrics Integration', () => {
		it('should record cache operations in metrics', async () => {
			await service.set('key1', 'value1')
			await service.get('key1')
			await service.delete('key1')
			await service.clear()

			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'memory', 'success')
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'memory', 'hit')
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('delete', 'memory', 'success')
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('flush', 'memory', 'success')
		})

		it('should update hit ratio in metrics', async () => {
			await service.getStats()

			expect(metricsService.updateCacheHitRatio).toHaveBeenCalledWith('memory', expect.any(Number))
		})
	})
})
