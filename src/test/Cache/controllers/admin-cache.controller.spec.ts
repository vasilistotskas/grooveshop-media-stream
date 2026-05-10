import type { MockedObject } from 'vitest'
import { AdminCacheController } from '#microservice/Cache/controllers/admin-cache.controller'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { InternalSecretGuard } from '#microservice/common/guards/internal-secret.guard'
import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'reflect-metadata'

describe('adminCacheController', () => {
	let controller: AdminCacheController
	let cacheManager: MockedObject<MultiLayerCacheManager>

	beforeEach(async () => {
		const mockCacheManager = {
			invalidateNamespace: vi.fn().mockResolvedValue(undefined),
		}

		const module: TestingModule = await Test.createTestingModule({
			controllers: [AdminCacheController],
			providers: [
				{
					provide: MultiLayerCacheManager,
					useValue: mockCacheManager,
				},
			],
		})
			.overrideGuard(InternalSecretGuard)
			.useValue({ canActivate: () => true })
			.compile()

		controller = module.get<AdminCacheController>(AdminCacheController)
		cacheManager = module.get(MultiLayerCacheManager)
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
	})
})
