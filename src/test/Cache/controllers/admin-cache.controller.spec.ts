import type { MockedObject } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminCacheController } from '#microservice/Cache/controllers/admin-cache.controller'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { InternalSecretGuard } from '#microservice/common/guards/internal-secret.guard'
import { StorageCleanupService } from '#microservice/Storage/services/storage-cleanup.service'
import 'reflect-metadata'

describe('adminCacheController', () => {
	let controller: AdminCacheController
	let cacheManager: MockedObject<MultiLayerCacheManager>
	let storageCleanupService: MockedObject<StorageCleanupService>

	beforeEach(async () => {
		const mockCacheManager = {
			invalidateNamespace: vi.fn().mockResolvedValue(undefined),
		}

		const mockStorageCleanupService = {
			removeTenantFiles: vi.fn().mockResolvedValue({ filesRemoved: 0, errors: [] }),
		}

		const module: TestingModule = await Test.createTestingModule({
			controllers: [AdminCacheController],
			providers: [
				{
					provide: MultiLayerCacheManager,
					useValue: mockCacheManager,
				},
				{
					provide: StorageCleanupService,
					useValue: mockStorageCleanupService,
				},
			],
		})
			.overrideGuard(InternalSecretGuard)
			.useValue({ canActivate: () => true })
			.compile()

		controller = module.get<AdminCacheController>(AdminCacheController)
		cacheManager = module.get(MultiLayerCacheManager)
		storageCleanupService = module.get(StorageCleanupService)
	})

	describe('flushTenant', () => {
		it('should flush the cache for a valid tenant schema', async () => {
			const result = await controller.flushTenant({ tenantSchema: 'acme' })

			expect(result).toEqual({
				flushed: true,
				tenantSchema: 'acme',
				namespace: 'image:acme',
				timestamp: expect.any(Number),
			})
			expect(cacheManager.invalidateNamespace).toHaveBeenCalledWith('image:acme')
		})

		it('should flush the cache for "public" schema', async () => {
			const result = await controller.flushTenant({ tenantSchema: 'public' })

			expect(result.tenantSchema).toBe('public')
			expect(result.namespace).toBe('image:public')
			expect(cacheManager.invalidateNamespace).toHaveBeenCalledWith('image:public')
		})

		it('should flush the cache for underscore-prefixed tenant schema', async () => {
			const result = await controller.flushTenant({ tenantSchema: '_tenant_123' })

			expect(result.namespace).toBe('image:_tenant_123')
			expect(cacheManager.invalidateNamespace).toHaveBeenCalledWith('image:_tenant_123')
		})

		it('should throw BadRequestException for uppercase tenant schema', async () => {
			await expect(controller.flushTenant({ tenantSchema: 'UPPERCASE' }))
				.rejects
				.toThrow(BadRequestException)
		})

		it('should throw BadRequestException for tenant schema with hyphens', async () => {
			await expect(controller.flushTenant({ tenantSchema: 'bad-schema' }))
				.rejects
				.toThrow(BadRequestException)
		})

		it('should throw BadRequestException for tenant schema with special characters', async () => {
			await expect(controller.flushTenant({ tenantSchema: 'sch@ma!' }))
				.rejects
				.toThrow(BadRequestException)
		})

		it('should throw BadRequestException for empty tenant schema', async () => {
			await expect(controller.flushTenant({ tenantSchema: '' }))
				.rejects
				.toThrow(BadRequestException)
		})

		it('should throw BadRequestException when tenantSchema is missing', async () => {
			await expect(controller.flushTenant({} as any))
				.rejects
				.toThrow(BadRequestException)
		})

		it('should not affect other tenant namespaces when flushing tenant A', async () => {
			// Call invalidateNamespace for tenant A
			await controller.flushTenant({ tenantSchema: 'tenant_a' })

			// The invalidation call uses a precise namespace prefix, leaving tenant_b intact
			expect(cacheManager.invalidateNamespace).toHaveBeenCalledWith('image:tenant_a')
			expect(cacheManager.invalidateNamespace).not.toHaveBeenCalledWith('image:tenant_b')
			expect(cacheManager.invalidateNamespace).not.toHaveBeenCalledWith('image')
		})

		// FIX 1: memory+Redis invalidation alone leaves the on-disk tier
		// untouched, so flushed resources resurrect from disk on the next
		// request. The endpoint must also sweep storage/*.rsm files for the
		// flushed tenant schema.
		it('should also sweep the on-disk storage tier for the flushed tenant schema', async () => {
			await controller.flushTenant({ tenantSchema: 'acme' })

			expect(storageCleanupService.removeTenantFiles).toHaveBeenCalledWith('acme')
			expect(storageCleanupService.removeTenantFiles).toHaveBeenCalledTimes(1)
		})

		it('sweeps disk files after memory/Redis invalidation, not before', async () => {
			const callOrder: string[] = []
			cacheManager.invalidateNamespace.mockImplementation(async () => {
				callOrder.push('invalidateNamespace')
			})
			storageCleanupService.removeTenantFiles.mockImplementation(async () => {
				callOrder.push('removeTenantFiles')
				return { filesRemoved: 0, errors: [] }
			})

			await controller.flushTenant({ tenantSchema: 'acme' })

			expect(callOrder).toEqual(['invalidateNamespace', 'removeTenantFiles'])
		})

		it('still returns the documented response shape when disk files were removed', async () => {
			storageCleanupService.removeTenantFiles.mockResolvedValue({ filesRemoved: 3, errors: [] })

			const result = await controller.flushTenant({ tenantSchema: 'acme' })

			// The disk-removal count is logged, not part of the public response
			// contract (documented in CLAUDE.md) — response shape stays stable.
			expect(result).toEqual({
				flushed: true,
				tenantSchema: 'acme',
				namespace: 'image:acme',
				timestamp: expect.any(Number),
			})
		})

		it('does not fail the request for other tenant schemas when disk sweep reports errors', async () => {
			storageCleanupService.removeTenantFiles.mockResolvedValue({
				filesRemoved: 1,
				errors: ['Failed to read metadata corrupt.rsm: Unexpected token'],
			})

			const result = await controller.flushTenant({ tenantSchema: 'tenant_a' })

			expect(result.flushed).toBe(true)
			expect(storageCleanupService.removeTenantFiles).toHaveBeenCalledWith('tenant_a')
		})
	})
})
