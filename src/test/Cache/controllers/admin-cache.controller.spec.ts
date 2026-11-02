import type { MockedObject } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminCacheController } from '#microservice/Cache/controllers/admin-cache.controller'
import { TenantFlushService } from '#microservice/Cache/services/tenant-flush.service'
import { InternalSecretGuard } from '#microservice/common/guards/internal-secret.guard'
import 'reflect-metadata'

describe('adminCacheController', () => {
	let controller: AdminCacheController
	let tenantFlushService: MockedObject<TenantFlushService>

	beforeEach(async () => {
		const mockTenantFlushService = {
			flushTenant: vi.fn().mockImplementation(async (tenantSchema: string) => ({
				namespace: `image:${tenantSchema}`,
				objectsRemoved: 0,
				storeErrors: [],
				broadcastReceivers: 2,
			})),
		}

		const module: TestingModule = await Test.createTestingModule({
			controllers: [AdminCacheController],
			providers: [
				{ provide: TenantFlushService, useValue: mockTenantFlushService },
			],
		})
			.overrideGuard(InternalSecretGuard)
			.useValue({
				canActivate: () => true,
			})
			.compile()

		controller = module.get<AdminCacheController>(AdminCacheController)
		tenantFlushService = module.get(TenantFlushService)
	})

	describe('flushTenant', () => {
		it('flushes a valid tenant schema and reports the documented response shape', async () => {
			const result = await controller.flushTenant({ tenantSchema: 'acme' })

			expect(result).toEqual({
				flushed: true,
				tenantSchema: 'acme',
				namespace: 'image:acme',
				broadcastReceivers: 2,
				timestamp: expect.any(Number),
			})
			expect(tenantFlushService.flushTenant).toHaveBeenCalledExactlyOnceWith('acme')
		})

		it.each(['public', '_tenant_123', 'tenant_a'])('accepts the schema %s', async (tenantSchema) => {
			const result = await controller.flushTenant({ tenantSchema })

			expect(result.tenantSchema).toBe(tenantSchema)
			expect(result.namespace).toBe(`image:${tenantSchema}`)
			expect(tenantFlushService.flushTenant).toHaveBeenCalledWith(tenantSchema)
		})

		it.each([
			'UPPERCASE',
			'bad-schema',
			'sch@ma!',
			'',
		])('rejects the schema %j', async (tenantSchema) => {
			await expect(controller.flushTenant({ tenantSchema })).rejects.toThrow(BadRequestException)
			expect(tenantFlushService.flushTenant).not.toHaveBeenCalled()
		})

		it('rejects a body without tenantSchema', async () => {
			await expect(controller.flushTenant({} as never)).rejects.toThrow(BadRequestException)
			expect(tenantFlushService.flushTenant).not.toHaveBeenCalled()
		})

		it('reports zero broadcast receivers when the other replicas could not be reached', async () => {
			tenantFlushService.flushTenant.mockResolvedValue({
				namespace: 'image:acme',
				objectsRemoved: 1,
				storeErrors: [],
				broadcastReceivers: 0,
			})

			const result = await controller.flushTenant({ tenantSchema: 'acme' })

			expect(result.flushed).toBe(true)
			expect(result.broadcastReceivers).toBe(0)
		})
	})
})
