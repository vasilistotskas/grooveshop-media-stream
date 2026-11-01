import type { MockedObject } from 'vitest'
import type { OperationContext } from '#microservice/Cache/operations/cache-image-resource.operation'
import type { ProcessedImage } from '#microservice/Cache/operations/image-format-processor.service'
import { Buffer } from 'node:buffer'
import { createWriteStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { Readable, Writable } from 'node:stream'
import { InternalServerErrorException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CacheImageRequest, { ResizeOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import UnableToFetchResourceException from '#microservice/API/exceptions/unable-to-fetch-resource.exception'
import CacheImageResourceOperation from '#microservice/Cache/operations/cache-image-resource.operation'
import { ImageFormatProcessor } from '#microservice/Cache/operations/image-format-processor.service'
import { ResourceFetcher } from '#microservice/Cache/operations/resource-fetcher.service'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { RenditionCatalogueService } from '#microservice/Cache/services/rendition-catalogue.service'
import { RenditionSizeService } from '#microservice/Cache/services/rendition-size.service'
import { RenditionStoreService } from '#microservice/Cache/services/rendition-store.service'
import { TenantCacheEpochs } from '#microservice/Cache/services/tenant-cache-epochs.service'
import { ProcessingOverloadedError, UpstreamResourceTooLargeError } from '#microservice/common/errors/media-stream.errors'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import ManipulationJobResult from '#microservice/Processing/dto/manipulation-job-result.dto'
import FetchResourceResponseJob from '#microservice/Processing/jobs/fetch-resource-response.job'
import GenerateResourceIdentityFromRequestJob from '#microservice/Processing/jobs/generate-resource-identity-from-request.job'
import WebpImageManipulationJob from '#microservice/Processing/jobs/webp-image-manipulation.job'
import { ProcessingAdmissionService } from '#microservice/Processing/services/processing-admission.service'
import { ResourceValidationService } from '#microservice/Validation/services/resource-validation.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

vi.mock('node:fs', async importOriginal => ({
	...(await importOriginal<typeof import('node:fs')>()),
	createWriteStream: vi.fn(),
}))
vi.mock('node:fs/promises')

const mockedFs = vi.mocked(fs)
const mockCreateWriteStream = vi.mocked(createWriteStream)

const RESOURCE_ID = 'mock-resource-id'
const NEGATIVE_CACHE_TTL_SECONDS = 300
const MONTH_MS = 30 * 24 * 60 * 60 * 1000

function metadata(overrides: Partial<ResourceMetaData> = {}): ResourceMetaData {
	return new ResourceMetaData({
		version: 1,
		size: '1000',
		format: 'webp',
		dateCreated: Date.now(),
		publicTTL: 12 * MONTH_MS,
		privateTTL: 6 * MONTH_MS,
		...overrides,
	})
}

/** Bytes that sniff as PNG (the signature); Sharp is mocked, so nothing decodes them. */
const PNG_BYTES = Buffer.concat([
	Buffer.from([
		0x89,
		0x50,
		0x4E,
		0x47,
		0x0D,
		0x0A,
		0x1A,
		0x0A,
	]),
	Buffer.from('mock-image-data'),
])

function streamResponse(body: Buffer = PNG_BYTES): any {
	return {
		status: 200,
		statusText: 'OK',
		headers: { 'content-type': 'image/jpeg' },
		data: Readable.from([body]),
		config: { url: 'https://example.com/image.jpg', method: 'GET' },
	}
}

describe('cacheImageResourceOperation', () => {
	let operation: CacheImageResourceOperation
	let identityJob: MockedObject<GenerateResourceIdentityFromRequestJob>
	let fetchJob: MockedObject<FetchResourceResponseJob>
	let webpJob: MockedObject<WebpImageManipulationJob>
	let cacheManager: MockedObject<MultiLayerCacheManager>
	let validation: MockedObject<ResourceValidationService>
	let store: MockedObject<RenditionStoreService>
	let catalogue: MockedObject<RenditionCatalogueService>
	let sizes: MockedObject<RenditionSizeService>
	let metricsService: MockedObject<MetricsService>
	let epochs: TenantCacheEpochs
	let storageDir: string
	let request: CacheImageRequest
	let ctx: OperationContext
	const processedBuffer = Buffer.from('optimized-image-data')

	beforeEach(async () => {
		vi.resetAllMocks()
		mockCreateWriteStream.mockImplementation(() => new Writable({
			write: (_chunk, _encoding, callback) => callback(),
		}) as any)
		mockedFs.writeFile.mockResolvedValue()
		mockedFs.unlink.mockResolvedValue()

		request = new CacheImageRequest({
			resourceTarget: 'https://example.com/image.jpg',
			resizeOptions: new ResizeOptions({
				width: 100,
				height: 100,
				quality: 80,
				format: SupportedResizeFormats.webp,
				trimThreshold: 10,
			}),
		})

		identityJob = {
			handle: vi.fn().mockResolvedValue(RESOURCE_ID),
		} as any
		fetchJob = {
			handle: vi.fn().mockImplementation(async () => streamResponse()),
		} as any
		webpJob = {
			handle: vi.fn().mockResolvedValue(new ManipulationJobResult({ format: 'webp', size: '1000', buffer: processedBuffer })),
		} as any
		cacheManager = {
			get: vi.fn().mockResolvedValue(null),
			lookup: vi.fn().mockResolvedValue(null),
			set: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
			exists: vi.fn().mockResolvedValue(false),
		} as any
		validation = {
			validateFileSize: vi.fn().mockReturnValue(true),
		} as any
		store = {
			get: vi.fn().mockResolvedValue(null),
			put: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
		} as any
		catalogue = {
			record: vi.fn().mockResolvedValue(undefined),
		} as any
		sizes = {
			recordRendering: vi.fn().mockResolvedValue(undefined),
		} as any
		metricsService = {
			recordCacheOperation: vi.fn(),
			recordImageProcessing: vi.fn(),
			recordImageInput: vi.fn(),
			recordError: vi.fn(),
		} as any

		epochs = new TenantCacheEpochs()
		const configService = createConfigServiceMock()
		storageDir = storageDirectory(configService)

		const moduleRef = await Test.createTestingModule({
			providers: [
				CacheImageResourceOperation,
				// Real collaborators — they consume the mocked jobs/cache/config below,
				// so behaviour assertions against those mocks remain valid.
				ResourceFetcher,
				ImageFormatProcessor,
				{ provide: GenerateResourceIdentityFromRequestJob, useValue: identityJob },
				{ provide: FetchResourceResponseJob, useValue: fetchJob },
				{ provide: WebpImageManipulationJob, useValue: webpJob },
				{
					provide: ProcessingAdmissionService,
					useValue: {
						run: (fn: () => Promise<unknown>) => fn(),
					},
				},
				{ provide: MultiLayerCacheManager, useValue: cacheManager },
				{ provide: ResourceValidationService, useValue: validation },
				{ provide: RenditionStoreService, useValue: store },
				{ provide: RenditionCatalogueService, useValue: catalogue },
				{ provide: RenditionSizeService, useValue: sizes },
				{ provide: MetricsService, useValue: metricsService },
				{ provide: TenantCacheEpochs, useValue: epochs },
				{ provide: ConfigService, useValue: configService },
			],
		}).compile()

		operation = await moduleRef.resolve(CacheImageResourceOperation)
		ctx = await operation.setup(request)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe('resource paths', () => {
		it('puts the download temp file under the configured scratch directory', () => {
			expect(operation.getResourceTempPath(ctx)).toBe(join(storageDir, `${RESOURCE_ID}.${ctx.tempToken}.rst`))
		})
	})

	describe('setup', () => {
		it('returns a context with the generated identity and nothing loaded yet', () => {
			expect(identityJob.handle).toHaveBeenCalledWith(request)
			expect(ctx).toEqual({
				request,
				id: RESOURCE_ID,
				metaData: null,
				cached: null,
				cacheTier: null,
				flushEpoch: 0,
				tempToken: expect.any(String),
			})
		})

		it('records a validation error and rethrows when identity generation fails', async () => {
			identityJob.handle.mockRejectedValueOnce(new Error('hash failed'))

			await expect(operation.setup(request)).rejects.toThrow('hash failed')
			expect(metricsService.recordError).toHaveBeenCalledWith('validation', 'setup')
		})
	})

	describe('checkResourceExists', () => {
		it('keeps a valid layered hit and the layer that answered on the context, and asks the store nothing', async () => {
			const cached: ProcessedImage = {
				data: Buffer.from('cached-data'),
				metadata: metadata(),
			}
			cacheManager.lookup.mockResolvedValue({ value: cached, layer: 'redis' })

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(true)

			expect(cacheManager.lookup).toHaveBeenCalledWith('image:public', RESOURCE_ID, expect.any(Function))
			expect(ctx.cached).toBe(cached)
			expect(ctx.metaData).toBe(cached.metadata)
			expect(ctx.cacheTier).toBe('redis')
			expect(store.get).not.toHaveBeenCalled()
			// The manager records the layered tier itself
			expect(metricsService.recordCacheOperation).not.toHaveBeenCalled()
		})

		it('uses the tenant namespace of the request, for the layers and the store', async () => {
			request.tenantSchema = 'acme'
			ctx = await operation.setup(request)

			await operation.checkResourceExists(ctx)

			expect(cacheManager.lookup).toHaveBeenCalledWith('image:acme', RESOURCE_ID, expect.any(Function))
			expect(store.get).toHaveBeenCalledWith('acme', RESOURCE_ID)
		})

		it('deletes a corrupted layered entry and falls through to the store', async () => {
			cacheManager.lookup.mockResolvedValue({
				value: {
					data: Buffer.from('x'),
					metadata: {},
				},
				layer: 'memory',
			})

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(cacheManager.delete).toHaveBeenCalledWith('image:public', RESOURCE_ID)
			expect(store.get).toHaveBeenCalledTimes(1)
			expect(ctx.cached).toBeNull()
		})

		it('deletes an expired layered entry and falls through to the store', async () => {
			cacheManager.lookup.mockResolvedValue({
				value: {
					data: Buffer.from('x'),
					metadata: metadata({ dateCreated: Date.now() - 7 * MONTH_MS }),
				},
				layer: 'memory',
			})

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(cacheManager.delete).toHaveBeenCalledWith('image:public', RESOURCE_ID)
			expect(store.get).toHaveBeenCalledTimes(1)
		})

		it('serves a valid stored rendition from the store and refills the layered cache without waiting for it', async () => {
			const stored: ProcessedImage = {
				data: Buffer.from('stored-data'),
				metadata: metadata({ tenantSchema: 'acme' }),
			}
			store.get.mockResolvedValue(stored)
			let releaseSet!: () => void
			cacheManager.set.mockImplementation(() => new Promise<void>((resolve) => {
				releaseSet = resolve
			}))

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(true)

			expect(ctx.cached).toBe(stored)
			expect(ctx.metaData).toBe(stored.metadata)
			expect(ctx.cacheTier).toBe('store')
			expect(cacheManager.set).toHaveBeenCalledWith('image:public', RESOURCE_ID, stored, 6 * 30 * 24 * 3600)
			releaseSet()
		})

		it('is a miss when the store has nothing, or is off, down or slow (it answers null for all of them)', async () => {
			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(ctx.cached).toBeNull()
			expect(ctx.metaData).toBeNull()
		})

		it('is a miss for a stored rendition of a foreign version or an expired one', async () => {
			store.get.mockResolvedValueOnce({
				data: Buffer.from('x'),
				metadata: metadata({ version: 2 }),
			})
			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			store.get.mockResolvedValueOnce({
				data: Buffer.from('x'),
				metadata: metadata({ dateCreated: Date.now() - 7 * MONTH_MS }),
			})
			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(ctx.cached).toBeNull()
			expect(cacheManager.set).not.toHaveBeenCalled()
		})

		it('survives a failing backfill', async () => {
			store.get.mockResolvedValue({
				data: Buffer.from('stored-data'),
				metadata: metadata(),
			})
			cacheManager.set.mockRejectedValue(new Error('redis down'))

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(true)
			await new Promise(resolve => setImmediate(resolve))
		})

		it('never throws: an unexpected failure is a recorded miss', async () => {
			cacheManager.lookup.mockRejectedValue(new Error('Cache error'))

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(metricsService.recordError).toHaveBeenCalledWith('cache_check', 'resource_exists')
		})
	})

	describe('execute', () => {
		it('fetches, processes, persists and returns the processed image', async () => {
			const result = await operation.execute(ctx)

			expect(fetchJob.handle).toHaveBeenCalledWith(request)
			expect(mockCreateWriteStream).toHaveBeenCalledWith(operation.getResourceTempPath(ctx))
			expect(webpJob.handle).toHaveBeenCalledWith(operation.getResourceTempPath(ctx), request.resizeOptions)
			expect(result.data).toBe(processedBuffer)
			expect(result.metadata).toMatchObject({
				version: 1,
				size: '1000',
				format: 'webp',
				tenantSchema: 'public',
			})
			expect(cacheManager.set).toHaveBeenCalledWith('image:public', RESOURCE_ID, result, 6 * 30 * 24 * 3600)
			expect(metricsService.recordImageProcessing).toHaveBeenCalledWith('process', 'webp', 'success', expect.any(Number))
			expect(metricsService.recordImageInput).toHaveBeenCalledWith('png', PNG_BYTES.length)
		})

		it('does not make the response wait for the store: the image is made, and a slow store must not slow the request', async () => {
			store.put.mockImplementation(() => new Promise(() => {}))

			await expect(operation.execute(ctx)).resolves.toMatchObject({ data: processedBuffer })

			expect(store.put).toHaveBeenCalledOnce()
		})

		it('stores the rendition in the layered cache and the rendition store, under the request tenant, and removes the temp file', async () => {
			const result = await operation.execute(ctx)
			await expect(ctx.stored).resolves.toBe(true)

			expect(cacheManager.set).toHaveBeenCalledWith('image:public', RESOURCE_ID, result, 6 * 30 * 24 * 3600)
			expect(store.put).toHaveBeenCalledWith('public', RESOURCE_ID, result)
			expect(mockedFs.unlink).toHaveBeenCalledWith(operation.getResourceTempPath(ctx))
		})

		it('counts a rendition of an upload towards its folder, so the folder\'s other uploads can be pre-generated', async () => {
			const upload = new CacheImageRequest({ resourceTarget: 'http://static-svc/media/acme/uploads/blog%2Fa.png', resizeOptions: request.resizeOptions, tenantSchema: 'acme' })

			const uploadCtx = await operation.setup(upload)
			await operation.execute(uploadCtx)
			await uploadCtx.stored

			expect(catalogue.record).toHaveBeenCalledWith('blog', upload.resizeOptions)
		})

		it('counts the size the request named, not the preset it was mapped to, once the rendition is stored', async () => {
			const upload = new CacheImageRequest({ resourceTarget: 'http://static-svc/media/acme/uploads/blog%2Fa.png', resizeOptions: request.resizeOptions, tenantSchema: 'acme' })
			const uploadCtx = await operation.setup(upload, '700x410')

			await operation.execute(uploadCtx)
			await uploadCtx.stored

			expect(uploadCtx.requestedSize).toBe('700x410')
			expect(sizes.recordRendering).toHaveBeenCalledWith('700x410')
		})

		it('counts no size for a rendition the service made on its own initiative, or one the store refused', async () => {
			const own = await operation.setup(new CacheImageRequest({ resourceTarget: 'http://static-svc/media/acme/uploads/blog%2Fa.png', resizeOptions: request.resizeOptions, tenantSchema: 'acme' }))
			await operation.execute(own)
			await own.stored
			expect(sizes.recordRendering).not.toHaveBeenCalled()

			store.put.mockRejectedValue(new Error('down'))
			const refused = await operation.setup(new CacheImageRequest({ resourceTarget: 'http://static-svc/media/acme/uploads/blog%2Fb.png', resizeOptions: request.resizeOptions, tenantSchema: 'acme' }), '700x410')
			await operation.execute(refused)
			await refused.stored
			expect(sizes.recordRendering).not.toHaveBeenCalled()
		})

		it('counts nothing for a source that is not an upload', async () => {
			const staticCtx = await operation.setup(new CacheImageRequest({ resourceTarget: 'http://static-svc/static/images/logo.png', resizeOptions: request.resizeOptions }))
			await operation.execute(staticCtx)
			await staticCtx.stored

			expect(catalogue.record).not.toHaveBeenCalled()
		})

		it('serves the image uncached when the store cannot be written, instead of the default image', async () => {
			store.put.mockRejectedValue(new Error('the store did not answer'))

			const result = await operation.execute(ctx)

			expect(result.data).toBe(processedBuffer)
			await expect(ctx.stored).resolves.toBe(false)
			expect(metricsService.recordError).toHaveBeenCalledWith('cache_persist', 'write')
			expect(catalogue.record).not.toHaveBeenCalled()
			expect(mockedFs.unlink).toHaveBeenCalledWith(operation.getResourceTempPath(ctx))
		})

		it('routes a source sniffed as SVG through the SVG path, whatever the URL extension', async () => {
			const svg = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
			fetchJob.handle.mockResolvedValue(streamResponse(Buffer.from(svg)))
			mockedFs.readFile.mockResolvedValue(svg)

			await operation.execute(ctx)

			expect(metricsService.recordImageInput).toHaveBeenCalledWith('svg', svg.length)
			// Sanitised markup is written back to the temp file before Sharp rasterises it
			expect(mockedFs.writeFile).toHaveBeenCalledWith(operation.getResourceTempPath(ctx), expect.stringContaining('<svg'), 'utf8')
			expect(webpJob.handle).toHaveBeenCalledWith(operation.getResourceTempPath(ctx), request.resizeOptions)
		})

		it('removes the temp file and answers with a 500 when Sharp fails on the source', async () => {
			webpJob.handle.mockRejectedValue(new Error('Input buffer contains unsupported image format'))

			await expect(operation.execute(ctx)).rejects.toBeInstanceOf(InternalServerErrorException)

			expect(mockedFs.unlink).toHaveBeenCalledWith(operation.getResourceTempPath(ctx))
			expect(store.put).not.toHaveBeenCalled()
			expect(metricsService.recordError).toHaveBeenCalledWith('image_processing', 'execute')
			expect(metricsService.recordImageProcessing).toHaveBeenCalledWith('process', 'unknown', 'error', expect.any(Number))
			expect(metricsService.recordImageProcessing).toHaveBeenCalledWith('execute', 'unknown', 'error', expect.any(Number))
		})

		it('treats an admission shed as capacity, not a processing failure: no error metrics, error propagated', async () => {
			const shed = new ProcessingOverloadedError(2)
			webpJob.handle.mockRejectedValue(shed)

			await expect(operation.execute(ctx)).rejects.toBe(shed)

			expect(mockedFs.unlink).toHaveBeenCalledWith(operation.getResourceTempPath(ctx))
			expect(metricsService.recordError).not.toHaveBeenCalledWith('image_processing', 'execute')
			expect(metricsService.recordImageProcessing).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 'error', expect.anything(), expect.anything())
		})

		it('propagates typed errors unchanged so the caller sees their HTTP status', async () => {
			validation.validateFileSize.mockReturnValue(false)
			fetchJob.handle.mockResolvedValue({
				...streamResponse(),
				headers: { 'content-length': '50000000' },
			})

			await expect(operation.execute(ctx)).rejects.toBeInstanceOf(UpstreamResourceTooLargeError)
			expect(metricsService.recordImageProcessing).toHaveBeenCalledWith('execute', 'unknown', 'error', expect.any(Number))
		})

		describe('error lines', () => {
			afterEach(() => {
				vi.restoreAllMocks()
			})

			it('logs no ERROR for a missing source: the fetcher logged its 404 at WARN', async () => {
				const error = vi.spyOn(CorrelatedLogger, 'error').mockImplementation(() => {})
				const warn = vi.spyOn(CorrelatedLogger, 'warn').mockImplementation(() => {})
				fetchJob.handle.mockResolvedValue({
					...streamResponse(),
					status: 404,
					statusText: 'Not Found',
					data: null,
				})

				await expect(operation.execute(ctx)).rejects.toBeInstanceOf(UnableToFetchResourceException)

				expect(error).not.toHaveBeenCalled()
				expect(warn).toHaveBeenCalledWith(expect.stringContaining('status: 404'), 'ResourceFetcher')
			})

			it('logs a source refused by policy at WARN with its detail, never at ERROR', async () => {
				const error = vi.spyOn(CorrelatedLogger, 'error').mockImplementation(() => {})
				const warn = vi.spyOn(CorrelatedLogger, 'warn').mockImplementation(() => {})
				validation.validateFileSize.mockReturnValue(false)
				fetchJob.handle.mockResolvedValue({
					...streamResponse(),
					headers: { 'content-length': '50000000' },
				})

				await expect(operation.execute(ctx)).rejects.toBeInstanceOf(UpstreamResourceTooLargeError)

				expect(error).not.toHaveBeenCalled()
				expect(warn).toHaveBeenCalledWith(expect.stringContaining('Source refused:'), 'CacheImageResourceOperation')
			})

			it('logs an ERROR for a failure nothing else explained', async () => {
				const error = vi.spyOn(CorrelatedLogger, 'error').mockImplementation(() => {})
				webpJob.handle.mockRejectedValue(new Error('Input buffer contains unsupported image format'))

				await expect(operation.execute(ctx)).rejects.toBeInstanceOf(InternalServerErrorException)

				expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to execute CacheImageResourceOperation'), expect.anything(), 'CacheImageResourceOperation')
			})
		})
	})

	describe('flush fencing', () => {
		it('records the tenant\'s flush epoch when the request starts', async () => {
			epochs.advance('public')
			epochs.advance('public')

			const started = await operation.setup(request)

			expect(started.flushEpoch).toBe(2)
		})

		it('reads the epoch of the request\'s own tenant', async () => {
			epochs.advance('acme')
			const acme = new CacheImageRequest({ resourceTarget: 'https://example.com/image.jpg', resizeOptions: request.resizeOptions, tenantSchema: 'acme' })

			expect((await operation.setup(acme)).flushEpoch).toBe(1)
			expect((await operation.setup(request)).flushEpoch).toBe(0)
		})

		it('still serves a result built across a flush, but does not cache it', async () => {
			epochs.advance('public')

			const result = await operation.execute(ctx)

			expect(result.data).toBe(processedBuffer)
			expect(cacheManager.set).not.toHaveBeenCalled()
			expect(store.put).not.toHaveBeenCalled()
			expect(catalogue.record).not.toHaveBeenCalled()
			expect(mockedFs.unlink).toHaveBeenCalledWith(operation.getResourceTempPath(ctx))
		})

		it('gives each request its own temp files, so requests from different epochs never write the same path', async () => {
			const other = await operation.setup(request)

			expect(other.tempToken).not.toBe(ctx.tempToken)
			expect(operation.getResourceTempPath(other)).not.toBe(operation.getResourceTempPath(ctx))
			expect(operation.getResourceTempPath(ctx)).toMatch(/\.rst$/)
		})

		it('logs a copy it could not remove', async () => {
			const warn = vi.spyOn(CorrelatedLogger, 'warn').mockImplementation(() => {})
			cacheManager.set.mockImplementation(async () => {
				epochs.advance('public')
			})
			store.delete.mockRejectedValue(new Error('the store did not answer'))

			await operation.execute(ctx)

			const messages = warn.mock.calls.map(([message]) => String(message))
			expect(messages.filter(m => m.includes('Could not remove a copy')).length).toBeGreaterThan(0)
			warn.mockRestore()
		})

		it('fences the layered lookup\'s backfill with the request\'s own epoch', async () => {
			await operation.checkResourceExists(ctx)
			const fence = cacheManager.lookup.mock.calls[0][2] as () => boolean

			expect(fence()).toBe(false)
			epochs.advance('public')
			expect(fence()).toBe(true)
		})

		it('caches normally when no flush landed', async () => {
			await operation.execute(ctx)

			expect(cacheManager.set).toHaveBeenCalledTimes(1)
			expect(store.put).toHaveBeenCalledTimes(1)
			expect(cacheManager.delete).not.toHaveBeenCalled()
			expect(store.delete).not.toHaveBeenCalled()
		})

		it('removes what it cached when a flush lands during the write', async () => {
			cacheManager.set.mockImplementation(async () => {
				epochs.advance('public')
			})

			const result = await operation.execute(ctx)
			await ctx.stored

			expect(result.data).toBe(processedBuffer)
			expect(cacheManager.delete).toHaveBeenCalledWith('image:public', RESOURCE_ID)
			expect(store.delete).toHaveBeenCalledWith('public', RESOURCE_ID)
			expect(catalogue.record).not.toHaveBeenCalled()
		})

		it('does not fail the request when the copies it removes are already gone', async () => {
			cacheManager.set.mockImplementation(async () => {
				epochs.advance('public')
			})
			store.delete.mockRejectedValue(new Error('gone'))

			await expect(operation.execute(ctx)).resolves.toMatchObject({ data: processedBuffer })
		})

		it('does not backfill the layered cache from a store read that a flush overtook', async () => {
			store.get.mockImplementation(async () => {
				epochs.advance('public')
				return {
					data: Buffer.from('stored-data'),
					metadata: metadata(),
				}
			})

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(true)

			expect(cacheManager.set).not.toHaveBeenCalled()
		})

		it('removes a backfill that a flush overtook while it was being written', async () => {
			store.get.mockResolvedValue({
				data: Buffer.from('stored-data'),
				metadata: metadata(),
			})
			cacheManager.set.mockImplementation(async () => {
				epochs.advance('public')
			})

			await operation.checkResourceExists(ctx)
			await new Promise(resolve => setImmediate(resolve))

			expect(cacheManager.delete).toHaveBeenCalledWith('image:public', RESOURCE_ID)
			expect(store.delete).toHaveBeenCalledWith('public', RESOURCE_ID)
		})

		it('leaves a backfill alone when no flush landed', async () => {
			store.get.mockResolvedValue({
				data: Buffer.from('stored-data'),
				metadata: metadata(),
			})

			await operation.checkResourceExists(ctx)
			await new Promise(resolve => setImmediate(resolve))

			expect(cacheManager.set).toHaveBeenCalledTimes(1)
			expect(cacheManager.delete).not.toHaveBeenCalled()
		})
	})

	describe('optimizeAndServeDefaultImage', () => {
		it('delegates to the format processor', async () => {
			mockedFs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
			const options = new ResizeOptions({ width: 100, height: 100, quality: 100 })

			const result = await operation.optimizeAndServeDefaultImage(options)

			expect(result).toBe(processedBuffer)
			expect(webpJob.handle).toHaveBeenCalledWith(
				join(cwd(), 'public', 'default.png'),
				expect.objectContaining({
					width: 100,
					height: 100,
					format: 'webp',
					quality: 100,
				}),
			)
		})
	})

	describe('negative cache TTL', () => {
		it('suppresses the fetch for an entry within the TTL window', async () => {
			const t0 = 1_700_000_000_000
			vi.useFakeTimers()
			vi.setSystemTime(t0)
			cacheManager.get.mockImplementation(async (_ns, key) => key === `negative:${RESOURCE_ID}`
				? { status: 404, timestamp: t0 }
				: null)

			vi.setSystemTime(t0 + (NEGATIVE_CACHE_TTL_SECONDS - 1) * 1000)

			await expect(operation.execute(ctx)).rejects.toBeInstanceOf(UnableToFetchResourceException)
			expect(fetchJob.handle).not.toHaveBeenCalled()
		})

		it('allows the fetch once the negative-cache TTL has elapsed', async () => {
			const t0 = 1_700_000_000_000
			vi.useFakeTimers()
			vi.setSystemTime(t0)
			cacheManager.get.mockImplementation(async (_ns, key) => key === `negative:${RESOURCE_ID}`
				? { status: 404, timestamp: t0 - NEGATIVE_CACHE_TTL_SECONDS * 1000 - 1 }
				: null)

			await operation.execute(ctx)

			expect(fetchJob.handle).toHaveBeenCalled()
		})

		it('stores the negative-cache entry with the TTL in seconds', async () => {
			fetchJob.handle.mockResolvedValue({ status: 404, headers: {}, data: null } as any)

			await expect(operation.execute(ctx)).rejects.toBeInstanceOf(UnableToFetchResourceException)

			expect(cacheManager.set).toHaveBeenCalledWith(
				'image:public',
				`negative:${RESOURCE_ID}`,
				expect.objectContaining({ status: 404 }),
				NEGATIVE_CACHE_TTL_SECONDS,
			)
		})
	})
})
