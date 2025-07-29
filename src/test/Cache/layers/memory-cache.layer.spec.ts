import { MemoryCacheLayer } from '@microservice/Cache/layers/memory-cache.layer'
import { MemoryCacheService } from '@microservice/Cache/services/memory-cache.service'

describe('memoryCacheLayer', () => {
	let layer: MemoryCacheLayer
	let mockMemoryCacheService: jest.Mocked<MemoryCacheService>

	beforeEach(() => {
		mockMemoryCacheService = {
			get: jest.fn(),
			set: jest.fn(),
			delete: jest.fn(),
			has: jest.fn(),
			exists: jest.fn(),
			clear: jest.fn(),
			getStats: jest.fn(),
		} as any

		layer = new MemoryCacheLayer(mockMemoryCacheService)
	})

	describe('basic Operations', () => {
		it('should get value from memory cache service', async () => {
			const testValue = { data: 'test' }
			mockMemoryCacheService.get.mockResolvedValue(testValue)

			const result = await layer.get('test-key')

			expect(result).toEqual(testValue)
			expect(mockMemoryCacheService.get).toHaveBeenCalledWith('test-key')
		})

		it('should set value in memory cache service', async () => {
			const testValue = { data: 'test' }
			mockMemoryCacheService.set.mockResolvedValue(undefined)

			await layer.set('test-key', testValue, 3600)

			expect(mockMemoryCacheService.set).toHaveBeenCalledWith('test-key', testValue, 3600)
		})

		it('should delete key from memory cache service', async () => {
			mockMemoryCacheService.delete.mockResolvedValue(undefined)

			await layer.delete('test-key')

			expect(mockMemoryCacheService.delete).toHaveBeenCalledWith('test-key')
		})

		it('should check existence in memory cache service', async () => {
			mockMemoryCacheService.has.mockResolvedValue(true)

			const result = await layer.exists('test-key')

			expect(result).toBe(true)
			expect(mockMemoryCacheService.has).toHaveBeenCalledWith('test-key')
		})

		it('should clear memory cache service', async () => {
			mockMemoryCacheService.clear.mockResolvedValue(undefined)

			await layer.clear()

			expect(mockMemoryCacheService.clear).toHaveBeenCalled()
		})
	})

	describe('statistics', () => {
		it('should return formatted stats from memory cache service', async () => {
			const mockStats = {
				hits: 100,
				misses: 20,
				keys: 50,
				ksize: 100,
				vsize: 924,
				hitRate: 0.83,
				memoryUsage: 1024,
			}
			mockMemoryCacheService.getStats.mockResolvedValue(mockStats)

			const result = await layer.getStats()

			expect(result).toEqual({
				hits: 100,
				misses: 20,
				keys: 50,
				hitRate: 0.83,
				memoryUsage: 1024,
				errors: 0,
			})
		})
	})

	describe('layer Properties', () => {
		it('should return correct layer name', () => {
			expect(layer.getLayerName()).toBe('memory')
		})

		it('should return correct priority', () => {
			expect(layer.getPriority()).toBe(1)
		})
	})
})
