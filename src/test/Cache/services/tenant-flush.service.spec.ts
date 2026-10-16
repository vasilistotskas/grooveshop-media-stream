import type { MockedObject } from 'vitest'
import type { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import type { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import type { StorageCleanupService } from '#microservice/Storage/services/storage-cleanup.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TenantCacheEpochs } from '#microservice/Cache/services/tenant-cache-epochs.service'
import { TenantFlushService } from '#microservice/Cache/services/tenant-flush.service'
import { TenantFlushIncompleteError } from '#microservice/common/errors/media-stream.errors'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'
import 'reflect-metadata'

type Handler = (message: string) => void

describe('tenantFlushService', () => {
	let service: TenantFlushService
	let redis: MockedObject<RedisCacheService>
	let cacheManager: MockedObject<MultiLayerCacheManager>
	let epochs: TenantCacheEpochs
	let storage: MockedObject<StorageCleanupService>
	let onBroadcast: Handler
	/** Every tier clear, in order, with the tenant's epoch at that moment. */
	let clears: string[]

	/** Delivers a message the way Redis would, then lets the async handler settle. */
	async function deliver(message: unknown): Promise<void> {
		onBroadcast(typeof message === 'string' ? message : JSON.stringify(message))
		await new Promise(resolve => setImmediate(resolve))
	}

	function publishedMessage(): { tenantSchema: string, origin: string } {
		return JSON.parse(redis.publish.mock.calls[0][1])
	}

	beforeEach(() => {
		clears = []
		epochs = new TenantCacheEpochs()
		redis = {
			subscribe: vi.fn((_channel: string, handler: Handler) => {
				onBroadcast = handler
			}),
			publish: vi.fn().mockResolvedValue(2),
		} as unknown as MockedObject<RedisCacheService>
		cacheManager = {
			invalidateNamespace: vi.fn(async (namespace: string, layer: string) => {
				clears.push(`${layer}@${epochs.current(namespace.split(':')[1])}`)
				return 1
			}),
		} as unknown as MockedObject<MultiLayerCacheManager>
		storage = {
			removeTenantFiles: vi.fn(async (schema: string) => {
				clears.push(`disk@${epochs.current(schema)}`)
				return { filesRemoved: 1, errors: [] }
			}),
		} as unknown as MockedObject<StorageCleanupService>

		service = new TenantFlushService(
			createConfigServiceMock({ 'cache.redis.db': 2 }),
			redis,
			cacheManager,
			epochs,
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
		it('clears disk, then Redis, then memory, advancing the epoch before each tier', async () => {
			await service.flushTenant('acme')

			expect(clears).toEqual(['disk@1', 'redis@2', 'memory@3'])
			expect(cacheManager.invalidateNamespace).toHaveBeenCalledWith('image:acme', 'redis')
			expect(cacheManager.invalidateNamespace).toHaveBeenCalledWith('image:acme', 'memory')
		})

		it('broadcasts only after the local clear', async () => {
			redis.publish.mockImplementation(async () => {
				clears.push('publish')
				return 2
			})

			await service.flushTenant('acme')

			expect(clears.at(-1)).toBe('publish')
		})

		it('advances only the flushed tenant\'s epoch', async () => {
			await service.flushTenant('tenant_a')

			expect(epochs.current('tenant_a')).toBe(3)
			expect(epochs.current('tenant_b')).toBe(0)
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

		it('still succeeds locally, with zero receivers, when only the broadcast fails', async () => {
			redis.publish.mockRejectedValue(new Error('READONLY'))

			const result = await service.flushTenant('acme')

			expect(result.broadcastReceivers).toBe(0)
		})

		it('fails with 503 when a tier could not be cleared, after clearing the rest and broadcasting', async () => {
			cacheManager.invalidateNamespace.mockImplementation(async (_namespace: string, layer: string) => {
				if (layer === 'redis') {
					throw new Error('Redis not connected')
				}
				clears.push(layer)
				return 0
			})

			const error = await service.flushTenant('acme').catch((caught: unknown) => caught)

			expect(error).toBeInstanceOf(TenantFlushIncompleteError)
			expect((error as TenantFlushIncompleteError).status).toBe(503)
			expect((error as TenantFlushIncompleteError).context).toMatchObject({ failures: ['redis: Redis not connected'] })
			expect(clears).toContain('memory')
			expect(redis.publish).toHaveBeenCalledOnce()
		})

		it('fails with 503 when the disk sweep throws', async () => {
			storage.removeTenantFiles.mockRejectedValue(new Error('EIO'))

			await expect(service.flushTenant('acme')).rejects.toBeInstanceOf(TenantFlushIncompleteError)
		})
	})

	describe('peer broadcasts', () => {
		const PEER = 'another-replica'

		it('clears disk, then Redis, then memory, advancing the epoch before each tier', async () => {
			await deliver({ tenantSchema: 'acme', origin: PEER })

			expect(clears).toEqual(['disk@1', 'redis@2', 'memory@3'])
		})

		it('does not broadcast again', async () => {
			await deliver({ tenantSchema: 'acme', origin: PEER })

			expect(redis.publish).not.toHaveBeenCalled()
		})

		it('ignores its own broadcast', async () => {
			await service.flushTenant('acme')
			const own = publishedMessage()
			clears = []

			await deliver(own)

			expect(clears).toEqual([])
			expect(epochs.current('acme')).toBe(3)
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

			expect(clears).toEqual([])
			expect(epochs.current('acme')).toBe(0)
		})

		it('keeps clearing the remaining tiers when one fails, and names it', async () => {
			const error = vi.spyOn(CorrelatedLogger, 'error').mockImplementation(() => {})
			storage.removeTenantFiles.mockRejectedValue(new Error('disk gone'))

			await deliver({ tenantSchema: 'acme', origin: PEER })

			expect(cacheManager.invalidateNamespace).toHaveBeenCalledWith('image:acme', 'redis')
			expect(cacheManager.invalidateNamespace).toHaveBeenCalledWith('image:acme', 'memory')
			expect(error).toHaveBeenCalledWith(expect.stringContaining('disk: disk gone'), undefined, 'TenantFlushService')
			error.mockRestore()
		})
	})
})
