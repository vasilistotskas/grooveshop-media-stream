import type { Mock, MockedObject } from 'vitest'
import type CacheImageResourceOperation from '#microservice/Cache/operations/cache-image-resource.operation'
import type { OperationContext } from '#microservice/Cache/operations/cache-image-resource.operation'
import type { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import type { RenditionCatalogueService } from '#microservice/Cache/services/rendition-catalogue.service'
import type { RenditionStoreService } from '#microservice/Cache/services/rendition-store.service'
import type { MetricsService } from '#microservice/Metrics/services/metrics.service'
import type { TenantDomainsService } from '#microservice/Validation/services/tenant-domains.service'
import { SchedulerRegistry } from '@nestjs/schedule'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CacheImageRequest, { FitOptions, ResizeOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { UrlBuilderService } from '#microservice/API/services/url-builder.service'
import { BackgroundYieldError, RenditionStoreUnavailableError, UpstreamResourceTooLargeError } from '#microservice/common/errors/media-stream.errors'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { CHECK_CONCURRENCY, FAILED_SOURCE_RETRY_MS, RenditionGeneratorService, YIELD_BACKOFF_MS } from '#microservice/Renditions/services/rendition-generator.service'
import { RenditionSourceScanner } from '#microservice/Renditions/services/rendition-source-scanner.service'
import { createConfigServiceMock } from '../helpers/config-service.mock.js'

const NOW = 1_800_000_000_000

function options(width: number): ResizeOptions {
	return new ResizeOptions({
		width,
		height: 0,
		fit: FitOptions.inside,
		format: SupportedResizeFormats.avif,
		quality: 55,
	})
}

/** A catalogue of one folder: its renditions, most shared first. */
function catalogueOf(...widths: number[]): Map<string, ResizeOptions[]> {
	return new Map([
		[
			'blog',
			widths.map(options),
		],
	])
}

describe('renditionGeneratorService', () => {
	let operation: MockedObject<Pick<CacheImageResourceOperation, 'setup' | 'execute'>>
	let scanner: MockedObject<Pick<RenditionSourceScanner, 'scan' | 'modifiedAt'>>
	let catalogueService: { learn: ReturnType<typeof vi.fn> }
	let store: { enabled: boolean, available: boolean, has: Mock<(tenant: string, id: string) => Promise<boolean>> }
	let redis: MockedObject<Pick<RedisCacheService, 'acquireLock' | 'delete'>>
	let tenantDomains: { isSuspended: ReturnType<typeof vi.fn> }
	let metrics: MockedObject<Pick<MetricsService, 'recordRenditionPregeneration' | 'setRenditionBacklog'>>
	let schedulerRegistry: { addCronJob: ReturnType<typeof vi.fn> }
	let modifiedAt: Record<string, number>
	/** What the store holds, by `{tenant}/{id}`. */
	let stored: Set<string>

	function build(overrides: Record<string, unknown> = {}): RenditionGeneratorService {
		return new RenditionGeneratorService(
			createConfigServiceMock({ 'renditions.mediaDirectory': '/media', ...overrides }),
			operation as unknown as CacheImageResourceOperation,
			scanner as unknown as RenditionSourceScanner,
			new UrlBuilderService(createConfigServiceMock({ 'backend.url': 'http://static-svc' })),
			catalogueService as unknown as RenditionCatalogueService,
			store as unknown as RenditionStoreService,
			redis as unknown as RedisCacheService,
			tenantDomains as unknown as TenantDomainsService,
			metrics as unknown as MetricsService,
			schedulerRegistry as unknown as SchedulerRegistry,
		)
	}

	function idOf(request: CacheImageRequest): string {
		return `${decodeURIComponent(request.resourceTarget.split('/uploads/')[1]).replace(/\//g, '_')}-${request.resizeOptions.width}`
	}

	beforeEach(() => {
		vi.useFakeTimers({
			toFake: ['setTimeout', 'Date'],
		})
		vi.setSystemTime(NOW)
		stored = new Set()
		modifiedAt = {}
		operation = {
			setup: vi.fn(async (request: CacheImageRequest) => ({
				request,
				id: idOf(request),
			}) as unknown as OperationContext),
			execute: vi.fn(async (ctx: OperationContext) => {
				stored.add(`${ctx.request.tenantSchema}/${ctx.id}`)
				ctx.stored = Promise.resolve(true)
				return {} as never
			}),
		} as never
		scanner = {
			scan: vi.fn(async () => [
				{ tenantSchema: 'acme', source: 'blog/new.png' },
			]),
			modifiedAt: vi.fn(async (_root: string, { source }: { source: string }) => modifiedAt[source] ?? 0),
		} as never
		catalogueService = {
			learn: vi.fn(async () => catalogueOf(672, 1024)),
		}
		store = {
			enabled: true,
			available: true,
			// Like the real store, a call while the breaker is open throws at once.
			has: vi.fn(async (tenant: string, id: string) => {
				if (!store.available) {
					throw new RenditionStoreUnavailableError('breaker open')
				}
				return stored.has(`${tenant}/${id}`)
			}),
		}
		redis = {
			acquireLock: vi.fn(async () => true),
			delete: vi.fn(async () => undefined),
		} as never
		tenantDomains = {
			isSuspended: vi.fn(() => false),
		}
		metrics = {
			recordRenditionPregeneration: vi.fn(),
			setRenditionBacklog: vi.fn(),
		} as never
		schedulerRegistry = {
			addCronJob: vi.fn(),
		}
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe('scheduling', () => {
		it('does nothing while no media directory is configured', () => {
			build({ 'renditions.mediaDirectory': '' }).onModuleInit()

			expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled()
		})

		it('does nothing while there is no rendition store to keep what it makes in', () => {
			store.enabled = false

			build().onModuleInit()

			expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled()
		})

		it('registers the cron once a media directory and a store are configured', () => {
			const service = build()

			service.onModuleInit()
			service.onModuleDestroy()

			expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith('rendition-pregeneration', expect.anything())
		})
	})

	describe('runCycle', () => {
		it('renders every rendition of an upload that has none, most shared first', async () => {
			const result = await build().runCycle()

			expect(result).toEqual({
				pending: 1,
				completed: 1,
				failed: 0,
				unchecked: 0,
				storeUnavailable: false,
			})
			expect(operation.execute).toHaveBeenCalledTimes(2)
			expect(stored).toEqual(new Set(['acme/blog_new.png-672', 'acme/blog_new.png-1024']))
			expect(metrics.recordRenditionPregeneration).toHaveBeenCalledWith('generated')
			expect(metrics.setRenditionBacklog).toHaveBeenCalledWith(1)
		})

		it('builds the request a visitor would have made, for the upload\'s own tenant and upstream URL', async () => {
			await build().runCycle()

			const request = operation.setup.mock.calls.find(([r]) => r.resizeOptions.width === 672)![0]
			expect(request).toMatchObject({ resourceTarget: 'http://static-svc/media/acme/uploads/blog%2Fnew.png', tenantSchema: 'acme' })
			expect(request.resizeOptions).toEqual(options(672))
			expect(request.resizeOptions).toBeInstanceOf(ResizeOptions)
		})

		it('learns the catalogue from the renditions made, with the configured limits', async () => {
			await build().runCycle()

			expect(catalogueService.learn).toHaveBeenCalledWith({ minSources: 3, maxPerKind: 16 })
		})

		it('treats an upload as done only when every rendition of its catalogue is stored', async () => {
			stored.add('acme/blog_new.png-672')
			stored.add('acme/blog_new.png-1024')

			const result = await build().runCycle()

			expect(result).toEqual({
				pending: 0,
				completed: 0,
				failed: 0,
				unchecked: 0,
				storeUnavailable: false,
			})
			expect(operation.execute).not.toHaveBeenCalled()
			expect(store.has).toHaveBeenCalledTimes(2)
			expect(metrics.setRenditionBacklog).toHaveBeenCalledWith(0)
		})

		it('renders the rest of an upload whose least shared rendition a visitor already made', async () => {
			stored.add('acme/blog_new.png-1024')

			const result = await build().runCycle()

			expect(result.pending).toBe(1)
			expect(operation.execute).toHaveBeenCalledTimes(1)
			expect(stored).toContain('acme/blog_new.png-672')
		})

		it('checks a done upload again once the catalogue of its folder gains a rendition', async () => {
			const service = build()
			await service.runCycle()
			catalogueService.learn.mockResolvedValue(catalogueOf(672, 1024, 1440))

			const second = await service.runCycle()

			expect(second).toEqual({
				pending: 1,
				completed: 1,
				failed: 0,
				unchecked: 0,
				storeUnavailable: false,
			})
			expect(stored).toContain('acme/blog_new.png-1440')
		})

		it('does not check a done upload again when its catalogue only changes order', async () => {
			const service = build()
			await service.runCycle()
			store.has.mockClear()
			catalogueService.learn.mockResolvedValue(catalogueOf(1024, 672))

			await service.runCycle()

			expect(store.has).not.toHaveBeenCalled()
		})

		it('does not ask the store about an upload again once it is known to be done', async () => {
			const service = build()

			await service.runCycle()
			store.has.mockClear()
			const second = await service.runCycle()

			expect(second.pending).toBe(0)
			expect(store.has).not.toHaveBeenCalled()
		})

		it('renders only what is missing of a partly rendered upload', async () => {
			stored.add('acme/blog_new.png-672')

			await build().runCycle()

			expect(operation.execute).toHaveBeenCalledTimes(1)
			expect(metrics.recordRenditionPregeneration).toHaveBeenCalledWith('present')
			expect(metrics.recordRenditionPregeneration).toHaveBeenCalledWith('generated')
		})

		it('does not call an upload done when the store refused the write of one of its renditions', async () => {
			const real = operation.execute.getMockImplementation()!
			operation.execute.mockImplementationOnce(async () => ({}) as never)
			operation.execute.mockImplementation(real)
			const service = build()

			const first = await service.runCycle()
			const second = await service.runCycle()

			expect(first.completed).toBe(1)
			expect(second.pending).toBe(1)
		})

		it('does nothing while no folder has a learned rendition', async () => {
			catalogueService.learn.mockResolvedValue(new Map())

			const result = await build().runCycle()

			expect(result).toEqual({
				pending: 0,
				completed: 0,
				failed: 0,
				unchecked: 0,
				storeUnavailable: false,
			})
			expect(scanner.scan).not.toHaveBeenCalled()
			expect(metrics.setRenditionBacklog).toHaveBeenCalledWith(0)
		})

		it('leaves an upload the store could not answer about to the next pass: unknown is not missing', async () => {
			store.has.mockRejectedValueOnce(new RenditionStoreUnavailableError('slow'))
			const service = build()

			const first = await service.runCycle()
			const second = await service.runCycle()

			expect(first).toEqual({
				pending: 0,
				completed: 0,
				failed: 0,
				unchecked: 1,
				storeUnavailable: false,
			})
			expect(second).toMatchObject({ pending: 1, completed: 1, unchecked: 0 })
		})

		it('goes on with the other uploads when one check misses its deadline', async () => {
			scanner.scan.mockResolvedValue([
				{ tenantSchema: 'acme', source: 'blog/slow.png' },
				{ tenantSchema: 'acme', source: 'blog/new.png' },
			])
			const real = store.has.getMockImplementation()!
			store.has.mockImplementation(async (tenant: string, id: string) => {
				if (id.startsWith('blog_slow.png')) {
					throw new RenditionStoreUnavailableError('slow')
				}
				return real(tenant, id)
			})

			const result = await build().runCycle()

			expect(result).toEqual({
				pending: 1,
				completed: 1,
				failed: 0,
				unchecked: 1,
				storeUnavailable: false,
			})
			expect(stored).toEqual(new Set(['acme/blog_new.png-672', 'acme/blog_new.png-1024']))
		})

		it('does not render a rendition the store could not say it holds, and leaves its upload incomplete', async () => {
			const service = build()
			const real = store.has.getMockImplementation()!
			// The pending check answers (nothing stored); the per-rendition check of 1024 does not.
			store.has.mockImplementation(async (tenant: string, id: string) => {
				if (id.endsWith('-1024') && operation.execute.mock.calls.length > 0) {
					throw new RenditionStoreUnavailableError('slow')
				}
				return real(tenant, id)
			})

			const first = await service.runCycle()
			store.has.mockImplementation(real)
			const second = await service.runCycle()

			expect(first.completed).toBe(1)
			expect(stored).toEqual(new Set(['acme/blog_new.png-672', 'acme/blog_new.png-1024']))
			expect(operation.execute).toHaveBeenCalledTimes(2)
			expect(second.pending).toBe(1)
		})

		it('ends the pass once the store breaker opens, checking nothing more', async () => {
			scanner.scan.mockResolvedValue(Array.from({ length: CHECK_CONCURRENCY * 3 }, (_, i) => ({ tenantSchema: 'acme', source: `blog/${i}.png` })))
			store.has.mockImplementation(async () => {
				store.available = false
				throw new RenditionStoreUnavailableError('down')
			})

			const result = await build().runCycle()

			expect(store.has).toHaveBeenCalledTimes(CHECK_CONCURRENCY)
			expect(result).toEqual({
				pending: 0,
				completed: 0,
				failed: 0,
				unchecked: CHECK_CONCURRENCY * 3,
				storeUnavailable: true,
			})
			expect(operation.execute).not.toHaveBeenCalled()
		})

		it('stops rendering once the store breaker opens', async () => {
			scanner.scan.mockResolvedValue([
				{ tenantSchema: 'acme', source: 'blog/a.png' },
				{ tenantSchema: 'acme', source: 'blog/b.png' },
			])
			const service = build()
			operation.execute.mockImplementationOnce(async (ctx: OperationContext) => {
				store.available = false
				ctx.stored = Promise.resolve(false)
				return {} as never
			})

			const result = await service.runCycle()

			expect(result).toMatchObject({ pending: 2, completed: 1, storeUnavailable: true })
			expect(operation.execute).toHaveBeenCalledTimes(1)
		})

		it('keeps at most CHECK_CONCURRENCY store checks in flight', async () => {
			scanner.scan.mockResolvedValue(Array.from({ length: CHECK_CONCURRENCY * 4 }, (_, i) => ({ tenantSchema: 'acme', source: `blog/${i}.png` })))
			stored = new Set(Array.from({ length: CHECK_CONCURRENCY * 4 }, (_, i) => [`acme/blog_${i}.png-672`, `acme/blog_${i}.png-1024`]).flat())
			let inFlight = 0
			let peak = 0
			store.has.mockImplementation(async (tenant: string, id: string) => {
				inFlight++
				peak = Math.max(peak, inFlight)
				await Promise.resolve()
				inFlight--
				return stored.has(`${tenant}/${id}`)
			})

			await build().runCycle()

			expect(peak).toBe(CHECK_CONCURRENCY)
		})

		it('logs an error for a pass the breaker ended, and none for one slow check', async () => {
			const error = vi.spyOn(CorrelatedLogger, 'error').mockImplementation(() => undefined)
			const log = vi.spyOn(CorrelatedLogger, 'log').mockImplementation(() => undefined)
			const scheduled = (service: RenditionGeneratorService): Promise<void> => (service as unknown as { runScheduled: () => Promise<void> }).runScheduled()

			store.has.mockRejectedValueOnce(new RenditionStoreUnavailableError('slow'))
			await scheduled(build())
			expect(error).not.toHaveBeenCalled()
			expect(log).toHaveBeenCalledWith(expect.stringContaining('1 left unchecked'), 'RenditionGeneratorService')

			store.has.mockImplementation(async () => {
				store.available = false
				throw new RenditionStoreUnavailableError('down')
			})
			await scheduled(build())
			expect(error).toHaveBeenCalledWith(expect.stringContaining('the rendition store is failing'), undefined, 'RenditionGeneratorService')

			error.mockRestore()
			log.mockRestore()
		})

		it('skips uploads of a folder with no learned rendition', async () => {
			scanner.scan.mockResolvedValue([
				{ tenantSchema: 'acme', source: 'files/new.png' },
			])

			expect((await build().runCycle()).pending).toBe(0)
		})

		it('skips a suspended store', async () => {
			tenantDomains.isSuspended.mockImplementation((schema: string) => schema === 'acme')

			expect((await build().runCycle()).pending).toBe(0)
		})

		it('renders the newest upload first', async () => {
			scanner.scan.mockResolvedValue([
				{ tenantSchema: 'acme', source: 'blog/old.png' },
				{ tenantSchema: 'acme', source: 'blog/new.png' },
			])
			modifiedAt = { 'blog/old.png': 1, 'blog/new.png': 2 }

			await build().runCycle()

			expect(operation.execute.mock.calls[0][0].id).toContain('blog_new.png')
		})

		it('leaves an upload to the replica that holds its lock', async () => {
			redis.acquireLock.mockResolvedValue(false)

			const result = await build().runCycle()

			expect(operation.execute).not.toHaveBeenCalled()
			expect(result.completed).toBe(1)
			expect(redis.delete).not.toHaveBeenCalled()
		})

		it('releases the lock of an upload when it is done', async () => {
			await build().runCycle()

			expect(redis.acquireLock).toHaveBeenCalledWith('renditions:lock:acme/blog/new.png', expect.any(Number))
			expect(redis.delete).toHaveBeenCalledWith('renditions:lock:acme/blog/new.png')
		})

		it('steps aside while a request needs the pipeline and retries after a pause', async () => {
			const real = operation.execute.getMockImplementation()!
			operation.execute.mockRejectedValueOnce(new BackgroundYieldError(2, { reason: 'background_yield' }))
			operation.execute.mockImplementation(real)

			const cycle = build().runCycle()
			await vi.waitFor(() => expect(metrics.recordRenditionPregeneration).toHaveBeenCalledWith('yielded'))
			await vi.advanceTimersByTimeAsync(YIELD_BACKOFF_MS)
			const result = await cycle

			expect(result.completed).toBe(1)
			expect(operation.execute).toHaveBeenCalledTimes(3)
		})

		it('gives up on an upload it cannot render and leaves it alone for a while', async () => {
			operation.execute.mockRejectedValue(new UpstreamResourceTooLargeError('too large', { size: 1 }))
			const service = build()

			const first = await service.runCycle()
			const second = await service.runCycle()
			vi.setSystemTime(NOW + FAILED_SOURCE_RETRY_MS + 1)
			const third = await service.runCycle()

			expect(first).toEqual({
				pending: 1,
				completed: 0,
				failed: 1,
				unchecked: 0,
				storeUnavailable: false,
			})
			expect(second.pending).toBe(0)
			expect(third.pending).toBe(1)
			expect(metrics.recordRenditionPregeneration).toHaveBeenCalledWith('failed')
		})

		it('runs one cycle at a time', async () => {
			let release!: () => void
			scanner.scan.mockReturnValue(new Promise((resolve) => {
				release = () => resolve([])
			}))
			const service = build()

			const running = service.runCycle()
			await vi.waitFor(() => expect(scanner.scan).toHaveBeenCalledTimes(1))
			const overlapping = await service.runCycle()
			release()
			await running

			expect(overlapping).toEqual({
				pending: 0,
				completed: 0,
				failed: 0,
				unchecked: 0,
				storeUnavailable: false,
			})
			expect(scanner.scan).toHaveBeenCalledTimes(1)
		})

		it('stops starting uploads once it is shutting down', async () => {
			scanner.scan.mockResolvedValue([
				{ tenantSchema: 'acme', source: 'blog/a.png' },
				{ tenantSchema: 'acme', source: 'blog/b.png' },
			])
			const service = build()
			operation.execute.mockImplementationOnce(async () => {
				service.onModuleDestroy()
				return {} as never
			})

			await service.runCycle()

			expect(operation.execute).toHaveBeenCalledTimes(1)
		})
	})
})
