import type { MockedObject } from 'vitest'
import type { MemoryCacheLayer } from '#microservice/Cache/layers/memory-cache.layer'
import type { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import type { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import type { StorageCleanupService } from '#microservice/Storage/services/storage-cleanup.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TenantFlushService } from '#microservice/Cache/services/tenant-flush.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'
import 'reflect-metadata'

type Handler = (message: string) => void

describe('tenantFlushService', () => {
	let service: TenantFlushService
	let redis: MockedObject<RedisCacheService>
	let cacheManager: MockedObject<MultiLayerCacheManager>
	let memoryLayer: MockedObject<MemoryCacheLayer>
	let storage: MockedObject<StorageCleanupService>
	let onBroadcast: Handler

	/** Delivers a message the way Redis would, then lets the async handler settle. */
	async function deliver(message: unknown): Promise<void> {
		onBroadcast(typeof message === 'string' ? message : JSON.stringify(message))
		await new Promise(resolve => setImmediate(resolve))
	}

	function publishedMessage(): { tenantSchema: string, origin: string } {
		return JSON.parse(redis.publish.mock.calls[0][1])
	}

	beforeEach(() => {
		redis = {
			subscribe: vi.fn((_channel: string, handler: Handler) => {
				onBroadcast = handler
			}),
			publish: vi.fn().mockResolvedValue(2),
		} as unknown as MockedObject<RedisCacheService>
		cacheManager = { invalidateNamespace: vi.fn().mockResolvedValue(undefined) } as unknown as MockedObject<MultiLayerCacheManager>
		memoryLayer = { deleteByPrefix: vi.fn().mockResolvedValue(3) } as unknown as MockedObject<MemoryCacheLayer>
		storage = { removeTenantFiles: vi.fn().mockResolvedValue({ filesRemoved: 1, errors: [] }) } as unknown as MockedObject<StorageCleanupService>

		service = new TenantFlushService(
			createConfigServiceMock({ 'cache.redis.db': 2 }),
			redis,
			cacheManager,
			memoryLayer,
			storage,
		)
		service.onModuleInit()
	})

	describe('subscription', () => {
		it('subscribes to a channel scoped to the configured Redis database', () => {
			expect(redis.subscribe).toHaveBeenCalledExactlyOnceWith('mediastream:tenant-flush:2', expect.any(Function))
		})
	})

	describe('flushTenant', () => {
		it('clears memory and Redis, then the disk tier, then broadcasts', async () => {
			const order: string[] = []
			cacheManager.invalidateNamespace.mockImplementation(async () => {
				order.push('invalidateNamespace')
			})
			storage.removeTenantFiles.mockImplementation(async () => {
				order.push('removeTenantFiles')
				return { filesRemoved: 1, errors: [] }
			})
			redis.publish.mockImplementation(async () => {
				order.push('publish')
				return 2
			})

			await service.flushTenant('acme')

			expect(order).toEqual(['invalidateNamespace', 'removeTenantFiles', 'publish'])
			expect(cacheManager.invalidateNamespace).toHaveBeenCalledWith('image:acme')
			expect(storage.removeTenantFiles).toHaveBeenCalledWith('acme')
		})

		it('reports the namespace, the removed files and the broadcast receivers', async () => {
			storage.removeTenantFiles.mockResolvedValue({ filesRemoved: 4, errors: ['boom'] })

			const result = await service.flushTenant('acme')

			expect(result).toEqual({ namespace: 'image:acme', filesRemoved: 4, diskErrors: ['boom'], broadcastReceivers: 2 })
		})

		it('broadcasts the tenant on the scoped channel', async () => {
			await service.flushTenant('acme')

			expect(redis.publish).toHaveBeenCalledExactlyOnceWith('mediastream:tenant-flush:2', expect.any(String))
			expect(publishedMessage()).toEqual({ tenantSchema: 'acme', origin: expect.any(String) })
		})

		it('leaves other tenants alone', async () => {
			await service.flushTenant('tenant_a')

			expect(cacheManager.invalidateNamespace).not.toHaveBeenCalledWith('image:tenant_b')
			expect(cacheManager.invalidateNamespace).not.toHaveBeenCalledWith('image')
		})

		it('still succeeds locally, with zero receivers, when the broadcast fails', async () => {
			redis.publish.mockRejectedValue(new Error('READONLY'))

			const result = await service.flushTenant('acme')

			expect(result.broadcastReceivers).toBe(0)
			expect(cacheManager.invalidateNamespace).toHaveBeenCalledWith('image:acme')
		})

		it('reports zero receivers when Redis is disconnected', async () => {
			redis.publish.mockResolvedValue(0)

			const result = await service.flushTenant('acme')

			expect(result.broadcastReceivers).toBe(0)
		})
	})

	describe('peer broadcasts', () => {
		const PEER = 'another-replica'

		it('drops the tenant\'s memory entries and disk files', async () => {
			await deliver({ tenantSchema: 'acme', origin: PEER })

			expect(memoryLayer.deleteByPrefix).toHaveBeenCalledExactlyOnceWith('image:acme:')
			expect(storage.removeTenantFiles).toHaveBeenCalledExactlyOnceWith('acme')
		})

		it('does not touch Redis: the origin already cleared the shared tier', async () => {
			await deliver({ tenantSchema: 'acme', origin: PEER })

			expect(cacheManager.invalidateNamespace).not.toHaveBeenCalled()
			expect(redis.publish).not.toHaveBeenCalled()
		})

		it('ignores its own broadcast', async () => {
			await service.flushTenant('acme')
			const own = publishedMessage()
			vi.clearAllMocks()

			await deliver(own)

			expect(memoryLayer.deleteByPrefix).not.toHaveBeenCalled()
			expect(storage.removeTenantFiles).not.toHaveBeenCalled()
		})

		it.each([
			['unparsable JSON', '{nope'],
			['a non-object', '42'],
			['a null payload', 'null'],
			['a missing origin', { tenantSchema: 'acme' }],
			['a missing tenant', { origin: PEER }],
			['a non-string tenant', { tenantSchema: 7, origin: PEER }],
			['an invalid schema', { tenantSchema: 'Bad-Schema', origin: PEER }],
			['a traversal attempt', { tenantSchema: '../etc', origin: PEER }],
		])('ignores %s', async (_name, message) => {
			await deliver(message)

			expect(memoryLayer.deleteByPrefix).not.toHaveBeenCalled()
			expect(storage.removeTenantFiles).not.toHaveBeenCalled()
		})

		it('still sweeps the disk when the memory tier fails', async () => {
			memoryLayer.deleteByPrefix.mockRejectedValue(new Error('memory gone'))

			await deliver({ tenantSchema: 'acme', origin: PEER })

			expect(storage.removeTenantFiles).toHaveBeenCalledExactlyOnceWith('acme')
		})

		it('still clears the memory tier when the disk sweep fails', async () => {
			storage.removeTenantFiles.mockRejectedValue(new Error('disk gone'))

			await deliver({ tenantSchema: 'acme', origin: PEER })

			expect(memoryLayer.deleteByPrefix).toHaveBeenCalledExactlyOnceWith('image:acme:')
		})

		it('names the tier that failed', async () => {
			const error = vi.spyOn(CorrelatedLogger, 'error').mockImplementation(() => {})
			storage.removeTenantFiles.mockRejectedValue(new Error('disk gone'))

			await deliver({ tenantSchema: 'acme', origin: PEER })

			expect(error).toHaveBeenCalledWith(expect.stringContaining('disk tier: disk gone'), undefined, 'TenantFlushService')
			error.mockRestore()
		})
	})
})
