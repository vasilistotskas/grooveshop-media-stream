import type { Redis } from 'ioredis'
import type { MockedObject } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RedisCacheLayer } from '#microservice/Cache/layers/redis-cache.layer'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'

describe('redisCacheLayer', () => {
	let layer: RedisCacheLayer
	let redisCacheService: MockedObject<RedisCacheService>

	beforeEach(() => {
		redisCacheService = {
			get: vi.fn(),
			set: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
			has: vi.fn(),
			clear: vi.fn().mockResolvedValue(undefined),
			getStats: vi.fn(),
			getTtl: vi.fn(),
			getConnectionStatus: vi.fn(),
			getClient: vi.fn(),
		} as unknown as MockedObject<RedisCacheService>

		layer = new RedisCacheLayer(redisCacheService)
	})

	describe('delegation', () => {
		it('should read through the service', async () => {
			redisCacheService.get.mockResolvedValue({ data: 'test' })

			await expect(layer.get('test-key')).resolves.toEqual({ data: 'test' })
			expect(redisCacheService.get).toHaveBeenCalledWith('test-key')
		})

		it('should write, delete, check and clear through the service', async () => {
			redisCacheService.has.mockResolvedValue(true)

			await layer.set('test-key', { data: 'test' }, 3600)
			await layer.delete('test-key')
			await expect(layer.exists('test-key')).resolves.toBe(true)
			await layer.clear()

			expect(redisCacheService.set).toHaveBeenCalledWith('test-key', { data: 'test' }, 3600)
			expect(redisCacheService.delete).toHaveBeenCalledWith('test-key')
			expect(redisCacheService.has).toHaveBeenCalledWith('test-key')
			expect(redisCacheService.clear).toHaveBeenCalledOnce()
		})

		it('should report the TTL from the service', async () => {
			redisCacheService.getTtl.mockResolvedValue(120)

			await expect(layer.getTtl('test-key')).resolves.toBe(120)
		})
	})

	describe('error propagation', () => {
		// MultiLayerCacheManager catches per layer and records exactly one error
		// sample, so the layer must not swallow anything.
		it.each([
			['get', () => layer.get('k')],
			['set', () => layer.set('k', 'v', 10)],
			['delete', () => layer.delete('k')],
			['has', () => layer.exists('k')],
			['clear', () => layer.clear()],
			['getStats', () => layer.getStats()],
		] as const)('should propagate %s failures', async (method, call) => {
			redisCacheService[method].mockRejectedValue(new Error('Redis error'))

			await expect(call()).rejects.toThrow('Redis error')
		})
	})

	describe('deleteByPrefix', () => {
		it('should return 0 without a client', async () => {
			redisCacheService.getClient.mockReturnValue(null)

			await expect(layer.deleteByPrefix('image:acme:')).resolves.toBe(0)
		})

		it('should SCAN the prefix and DEL every batch', async () => {
			const client = {
				scan: vi.fn()
					.mockResolvedValueOnce(['7', ['image:acme:a', 'image:acme:b']])
					.mockResolvedValueOnce(['0', ['image:acme:c']]),
				del: vi.fn().mockResolvedValue(1),
			}
			redisCacheService.getClient.mockReturnValue(client as unknown as Redis)

			await expect(layer.deleteByPrefix('image:acme:')).resolves.toBe(3)

			expect(client.scan).toHaveBeenCalledWith('0', 'MATCH', 'image:acme:*', 'COUNT', 100)
			expect(client.scan).toHaveBeenCalledWith('7', 'MATCH', 'image:acme:*', 'COUNT', 100)
			expect(client.del).toHaveBeenCalledWith('image:acme:a', 'image:acme:b')
			expect(client.del).toHaveBeenCalledWith('image:acme:c')
		})
	})

	describe('statistics', () => {
		it('should combine service stats with the connection error count', async () => {
			redisCacheService.getStats.mockResolvedValue({ hits: 10, misses: 5, keys: 20, ksize: 0, vsize: 512, hitRate: 0.67 })
			redisCacheService.getConnectionStatus.mockReturnValue({ connected: true, stats: { hits: 10, misses: 5, operations: 15, errors: 2 } })

			await expect(layer.getStats()).resolves.toEqual({ hits: 10, misses: 5, keys: 20, hitRate: 0.67, errors: 2 })
		})
	})

	describe('layer properties', () => {
		it('should be the second-priority "redis" layer', () => {
			expect(layer.getLayerName()).toBe('redis')
			expect(layer.getPriority()).toBe(2)
		})
	})
})
