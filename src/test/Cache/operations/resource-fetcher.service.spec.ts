import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CacheImageRequest, { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import UnableToFetchResourceException from '#microservice/API/exceptions/unable-to-fetch-resource.exception'
import { ResourceFetcher } from '#microservice/Cache/operations/resource-fetcher.service'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { ConfigService } from '#microservice/Config/config.service'
import FetchResourceResponseJob from '#microservice/Processing/jobs/fetch-resource-response.job'
import StoreResourceResponseToFileJob from '#microservice/Processing/jobs/store-resource-response-to-file.job'
import { InputSanitizationService } from '#microservice/Validation/services/input-sanitization.service'

// Regression coverage: negative-cache entries (fetch failures) must be
// namespaced per tenant, mirroring CacheImageResourceOperation.cacheNamespace().
// Before this fix, ResourceFetcher.fetchToTempFile hardcoded the 'image'
// namespace, so a failed fetch for one tenant would silently suppress
// retries for every other tenant requesting the same resource id.
describe('resourceFetcher — negative-cache tenant namespacing', () => {
	let fetcher: ResourceFetcher
	let mockFetchResourceResponseJob: FetchResourceResponseJob
	let mockStoreResourceResponseToFileJob: StoreResourceResponseToFileJob
	let mockCacheManager: MultiLayerCacheManager
	let cacheStore: Map<string, unknown>

	beforeEach(async () => {
		cacheStore = new Map()

		mockFetchResourceResponseJob = { handle: vi.fn() } as unknown as FetchResourceResponseJob
		mockStoreResourceResponseToFileJob = { handle: vi.fn() } as unknown as StoreResourceResponseToFileJob

		mockCacheManager = {
			get: vi.fn(async (namespace: string, key: string) => cacheStore.get(`${namespace}:${key}`) ?? null),
			set: vi.fn(async (namespace: string, key: string, value: unknown) => {
				cacheStore.set(`${namespace}:${key}`, value)
			}),
			delete: vi.fn(),
		} as unknown as MultiLayerCacheManager

		const mockInputSanitizationService = {
			validateFileSize: vi.fn().mockReturnValue(true),
		} as unknown as InputSanitizationService

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ResourceFetcher,
				{ provide: FetchResourceResponseJob, useValue: mockFetchResourceResponseJob },
				{ provide: StoreResourceResponseToFileJob, useValue: mockStoreResourceResponseToFileJob },
				{ provide: MultiLayerCacheManager, useValue: mockCacheManager },
				{ provide: InputSanitizationService, useValue: mockInputSanitizationService },
				{
					provide: ConfigService,
					useValue: {
						getOptional: vi.fn().mockImplementation((_key: string, defaultValue: any) => defaultValue),
					},
				},
			],
		}).compile()

		fetcher = await module.resolve(ResourceFetcher)
	})

	function requestFor(tenantSchema: string): CacheImageRequest {
		return new CacheImageRequest({
			resourceTarget: 'https://example.com/image.jpg',
			resizeOptions: new ResizeOptions(),
			tenantSchema,
		})
	}

	it('stores negative-cache entries under a tenant-namespaced key', async () => {
		vi.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValue({
			status: 404,
			headers: {},
			data: null,
		} as any)

		await expect(
			fetcher.fetchToTempFile(requestFor('acme'), 'shared-id', '/tmp/id.rst'),
		).rejects.toThrow(UnableToFetchResourceException)

		expect(mockCacheManager.set).toHaveBeenCalledWith(
			'image:acme',
			'negative:shared-id',
			expect.objectContaining({ status: 404 }),
			expect.any(Number),
		)
		expect(cacheStore.has('image:acme:negative:shared-id')).toBe(true)
		expect(cacheStore.has('image:public:negative:shared-id')).toBe(false)
	})

	it('does not let one tenant\'s negative-cache entry suppress another tenant\'s fetch for the same resource id', async () => {
		vi.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValueOnce({
			status: 404,
			headers: {},
			data: null,
		} as any)

		// Tenant "acme" fails and gets negative-cached under its own namespace.
		await expect(fetcher.fetchToTempFile(requestFor('acme'), 'shared-id', '/tmp/id.rst')).rejects.toThrow()
		expect(mockFetchResourceResponseJob.handle).toHaveBeenCalledTimes(1)

		// Tenant "beta" requesting the SAME resource id must still attempt a
		// fresh fetch — it must not be suppressed by acme's negative-cache entry.
		const mockStream = { pipe: vi.fn().mockReturnThis(), on: vi.fn() }
		vi.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValueOnce({
			status: 200,
			headers: {},
			data: mockStream,
		} as any)
		vi.spyOn(mockStoreResourceResponseToFileJob, 'handle').mockResolvedValue()

		await fetcher.fetchToTempFile(requestFor('beta'), 'shared-id', '/tmp/id.rst')
		expect(mockFetchResourceResponseJob.handle).toHaveBeenCalledTimes(2)
	})

	it('falls back to the "public" namespace when no tenantSchema is set on the request', async () => {
		vi.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValue({
			status: 404,
			headers: {},
			data: null,
		} as any)

		const request = new CacheImageRequest({
			resourceTarget: 'https://example.com/image.jpg',
			resizeOptions: new ResizeOptions(),
		})
		request.tenantSchema = ''

		await expect(fetcher.fetchToTempFile(request, 'anon-id', '/tmp/id.rst')).rejects.toThrow()

		expect(mockCacheManager.set).toHaveBeenCalledWith(
			'image:public',
			'negative:anon-id',
			expect.objectContaining({ status: 404 }),
			expect.any(Number),
		)
	})
})
