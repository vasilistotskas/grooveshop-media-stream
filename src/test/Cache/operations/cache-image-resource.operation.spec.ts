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
import { AccessCountTracker } from '#microservice/Cache/operations/access-count-tracker.service'
import CacheImageResourceOperation from '#microservice/Cache/operations/cache-image-resource.operation'
import { ImageFormatProcessor } from '#microservice/Cache/operations/image-format-processor.service'
import { ResourceFetcher } from '#microservice/Cache/operations/resource-fetcher.service'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { TenantCacheEpochs } from '#microservice/Cache/services/tenant-cache-epochs.service'
import { ProcessingOverloadedError, UpstreamResourceTooLargeError } from '#microservice/common/errors/media-stream.errors'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
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
	let tracker: MockedObject<AccessCountTracker>
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
		mockedFs.rename.mockResolvedValue()
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
		tracker = {
			record: vi.fn(),
			flush: vi.fn(),
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
				{ provide: AccessCountTracker, useValue: tracker },
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
		it('resolve under the configured storage directory', () => {
			expect(operation.getResourcePath(ctx)).toBe(join(storageDir, `${RESOURCE_ID}.rsc`))
			expect(operation.getResourceTempPath(ctx)).toBe(join(storageDir, `${RESOURCE_ID}.${ctx.tempToken}.rst`))
			expect(operation.getResourceMetaPath(ctx)).toBe(join(storageDir, `${RESOURCE_ID}.rsm`))
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
		it('keeps a valid layered hit and the layer that answered on the context, and records no cache metric of its own', async () => {
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
			expect(mockedFs.readFile).not.toHaveBeenCalled()
			// The manager records the layered tier itself
			expect(metricsService.recordCacheOperation).not.toHaveBeenCalled()
		})

		it('uses the tenant namespace of the request', async () => {
			request.tenantSchema = 'acme'
			ctx = await operation.setup(request)
			mockedFs.readFile.mockRejectedValue(new Error('ENOENT'))

			await operation.checkResourceExists(ctx)

			expect(cacheManager.lookup).toHaveBeenCalledWith('image:acme', RESOURCE_ID, expect.any(Function))
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'miss', expect.any(Number))
		})

		it('deletes a corrupted layered entry and falls through to the disk check', async () => {
			cacheManager.lookup.mockResolvedValue({
				value: {
					data: Buffer.from('x'),
					metadata: {},
				},
				layer: 'memory',
			})
			mockedFs.readFile.mockRejectedValue(new Error('ENOENT'))

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(cacheManager.delete).toHaveBeenCalledWith('image:public', RESOURCE_ID)
			expect(ctx.cached).toBeNull()
		})

		it('deletes an expired layered entry and falls through to the disk check', async () => {
			cacheManager.lookup.mockResolvedValue({
				value: {
					data: Buffer.from('x'),
					metadata: metadata({ dateCreated: Date.now() - 7 * MONTH_MS }),
				},
				layer: 'memory',
			})
			mockedFs.readFile.mockRejectedValue(new Error('ENOENT'))

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(cacheManager.delete).toHaveBeenCalledWith('image:public', RESOURCE_ID)
		})

		it('reports a valid disk pair as a filesystem hit, keeping the sidecar on the context but nothing cached', async () => {
			mockedFs.readFile.mockResolvedValue(JSON.stringify(metadata({ tenantSchema: 'acme' })))
			mockedFs.access.mockResolvedValue()

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(true)

			expect(mockedFs.readFile).toHaveBeenCalledWith(operation.getResourceMetaPath(ctx), 'utf8')
			expect(mockedFs.access).toHaveBeenCalledWith(operation.getResourcePath(ctx))
			expect(ctx.metaData).toBeInstanceOf(ResourceMetaData)
			expect(ctx.metaData?.tenantSchema).toBe('acme')
			expect(ctx.cached).toBeNull()
			expect(ctx.cacheTier).toBe('disk')
			expect(metricsService.recordCacheOperation).toHaveBeenCalledTimes(1)
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'hit', expect.any(Number))
		})

		it('records the filesystem duration in seconds', async () => {
			vi.spyOn(PerformanceTracker, 'endPhase').mockReturnValue(250)
			mockedFs.readFile.mockResolvedValue(JSON.stringify(metadata()))
			mockedFs.access.mockResolvedValue()

			await operation.checkResourceExists(ctx)

			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'hit', 0.25)
		})

		it('is a miss without a sidecar', async () => {
			mockedFs.readFile.mockRejectedValue(new Error('ENOENT'))

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(mockedFs.access).not.toHaveBeenCalled()
			expect(ctx.metaData).toBeNull()
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'miss', expect.any(Number))
		})

		it('is a miss for an orphan sidecar whose .rsc is gone', async () => {
			mockedFs.readFile.mockResolvedValue(JSON.stringify(metadata()))
			mockedFs.access.mockRejectedValue(new Error('ENOENT'))

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)
			expect(ctx.metaData).toBeNull()
		})

		it('is a miss for an unparsable sidecar, a foreign version, or an expired entry', async () => {
			mockedFs.access.mockResolvedValue()

			mockedFs.readFile.mockResolvedValueOnce('not json')
			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			mockedFs.readFile.mockResolvedValueOnce(JSON.stringify(metadata({ version: 2 })))
			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			mockedFs.readFile.mockResolvedValueOnce(JSON.stringify(metadata({ dateCreated: Date.now() - 7 * MONTH_MS })))
			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(ctx.metaData).toBeNull()
			expect(metricsService.recordCacheOperation).toHaveBeenCalledTimes(3)
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'miss', expect.any(Number))
		})

		it('never throws: an unexpected failure is a recorded miss', async () => {
			cacheManager.lookup.mockRejectedValue(new Error('Cache error'))

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(metricsService.recordError).toHaveBeenCalledWith('cache_check', 'resource_exists')
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'error', expect.any(Number))
		})
	})

	describe('loadResource', () => {
		it('returns the layered payload without touching the disk and counts the access', async () => {
			const cached: ProcessedImage = {
				data: Buffer.from('cached-data'),
				metadata: metadata(),
			}
			ctx.cached = cached
			ctx.metaData = cached.metadata

			await expect(operation.loadResource(ctx)).resolves.toBe(cached)

			expect(mockedFs.readFile).not.toHaveBeenCalled()
			expect(cacheManager.set).not.toHaveBeenCalled()
			expect(tracker.record).toHaveBeenCalledWith(operation.getResourceMetaPath(ctx))
		})

		it('reads the .rsc for a disk hit, backfills the layered cache fire-and-forget and counts the access', async () => {
			ctx.metaData = metadata()
			mockedFs.readFile.mockResolvedValue(Buffer.from('file-data'))
			let releaseSet!: () => void
			cacheManager.set.mockImplementation(() => new Promise<void>((resolve) => {
				releaseSet = resolve
			}))

			const result = await operation.loadResource(ctx)

			expect(mockedFs.readFile).toHaveBeenCalledWith(operation.getResourcePath(ctx))
			expect(result).toEqual({
				data: Buffer.from('file-data'),
				metadata: ctx.metaData,
			})
			expect(cacheManager.set).toHaveBeenCalledWith('image:public', RESOURCE_ID, result, 6 * 30 * 24 * 3600)
			expect(tracker.record).toHaveBeenCalledWith(operation.getResourceMetaPath(ctx))
			releaseSet()
		})

		it('survives a failing backfill', async () => {
			ctx.metaData = metadata()
			mockedFs.readFile.mockResolvedValue(Buffer.from('file-data'))
			cacheManager.set.mockRejectedValue(new Error('redis down'))

			await expect(operation.loadResource(ctx)).resolves.toMatchObject({
				data: Buffer.from('file-data'),
			})
			await new Promise(resolve => setImmediate(resolve))
		})

		it('returns null, counting nothing, when the .rsc vanished after the check', async () => {
			ctx.metaData = metadata()
			mockedFs.readFile.mockRejectedValue(new Error('ENOENT'))

			await expect(operation.loadResource(ctx)).resolves.toBeNull()

			expect(tracker.record).not.toHaveBeenCalled()
			expect(cacheManager.set).not.toHaveBeenCalled()
		})

		it('returns null for a context the existence check did not populate', async () => {
			await expect(operation.loadResource(ctx)).resolves.toBeNull()
			expect(mockedFs.readFile).not.toHaveBeenCalled()
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

		it('writes the .rsc/.rsm pair atomically, counts the write as the first access and removes the temp file', async () => {
			const resourcePath = operation.getResourcePath(ctx)
			const metaPath = operation.getResourceMetaPath(ctx)

			const result = await operation.execute(ctx)

			expect(mockedFs.writeFile).toHaveBeenCalledTimes(2)
			expect(mockedFs.writeFile).toHaveBeenCalledWith(`${resourcePath}.${ctx.tempToken}.tmp`, processedBuffer)
			expect(mockedFs.writeFile).toHaveBeenCalledWith(`${metaPath}.${ctx.tempToken}.tmp`, JSON.stringify(result.metadata), 'utf8')
			expect(mockedFs.rename).toHaveBeenCalledWith(`${resourcePath}.${ctx.tempToken}.tmp`, resourcePath)
			expect(mockedFs.rename).toHaveBeenCalledWith(`${metaPath}.${ctx.tempToken}.tmp`, metaPath)
			expect(Math.max(...mockedFs.writeFile.mock.invocationCallOrder)).toBeLessThan(Math.min(...mockedFs.rename.mock.invocationCallOrder))
			expect(tracker.record).toHaveBeenCalledWith(metaPath)
			expect(tracker.record.mock.invocationCallOrder[0]).toBeGreaterThan(Math.max(...mockedFs.rename.mock.invocationCallOrder))
			expect(mockedFs.unlink).toHaveBeenCalledWith(operation.getResourceTempPath(ctx))
		})

		it('records on the sidecar which upload a rendition was made from and with which options, so its siblings can be made for other uploads', async () => {
			const upload = new CacheImageRequest({ resourceTarget: 'http://static-svc/media/acme/uploads/blog%2Fa.png', resizeOptions: request.resizeOptions, tenantSchema: 'acme' })
			const uploadCtx = await operation.setup(upload)

			const result = await operation.execute(uploadCtx)

			expect(result.metadata.source).toBe('blog/a.png')
			expect(result.metadata.resizeOptions).toBe(upload.resizeOptions)
		})

		it('serves the image uncached when the volume cannot be written, instead of the default image', async () => {
			mockedFs.writeFile.mockRejectedValue(new Error('ENOSPC: no space left on device'))

			const result = await operation.execute(ctx)

			expect(result.data).toBe(processedBuffer)
			expect(metricsService.recordError).toHaveBeenCalledWith('cache_persist', 'write')
			expect(mockedFs.unlink).toHaveBeenCalledWith(operation.getResourceTempPath(ctx))
		})

		it('records no upload for a source that is not one', async () => {
			const result = await operation.execute(await operation.setup(new CacheImageRequest({ resourceTarget: 'http://static-svc/static/images/logo.png', resizeOptions: request.resizeOptions })))

			expect(result.metadata.source).toBeNull()
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
			expect(mockedFs.rename).not.toHaveBeenCalled()
			expect(tracker.record).not.toHaveBeenCalled()
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
		const RSC = () => operation.getResourcePath(ctx)
		const RSM = () => operation.getResourceMetaPath(ctx)

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
			expect(mockedFs.writeFile).not.toHaveBeenCalled()
			expect(mockedFs.rename).not.toHaveBeenCalled()
			expect(tracker.record).not.toHaveBeenCalled()
			expect(mockedFs.unlink).toHaveBeenCalledWith(operation.getResourceTempPath(ctx))
		})

		it('gives each request its own temp files, so requests from different epochs never write the same path', async () => {
			const other = await operation.setup(request)

			expect(other.tempToken).not.toBe(ctx.tempToken)
			expect(operation.getResourceTempPath(other)).not.toBe(operation.getResourceTempPath(ctx))
			expect(operation.getResourceTempPath(ctx)).toMatch(/\.rst$/)
		})

		it('logs a copy it could not remove, but not a file that was already gone', async () => {
			const warn = vi.spyOn(CorrelatedLogger, 'warn').mockImplementation(() => {})
			cacheManager.set.mockImplementation(async () => {
				epochs.advance('public')
			})
			mockedFs.unlink.mockImplementation(async (path) => {
				if (path === RSC()) {
					throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
				}
				if (path === RSM()) {
					throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
				}
			})

			await operation.execute(ctx)

			const messages = warn.mock.calls.map(([message]) => String(message))
			expect(messages.filter(m => m.includes('Could not remove a copy'))).toHaveLength(1)
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
			expect(mockedFs.rename).toHaveBeenCalledTimes(2)
			expect(cacheManager.delete).not.toHaveBeenCalled()
		})

		it('removes what it cached when a flush lands during the write', async () => {
			cacheManager.set.mockImplementation(async () => {
				epochs.advance('public')
			})

			const result = await operation.execute(ctx)

			expect(result.data).toBe(processedBuffer)
			expect(cacheManager.delete).toHaveBeenCalledWith('image:public', RESOURCE_ID)
			expect(mockedFs.unlink).toHaveBeenCalledWith(RSC())
			expect(mockedFs.unlink).toHaveBeenCalledWith(RSM())
			expect(tracker.record).not.toHaveBeenCalled()
		})

		it('does not fail the request when the files it removes are already gone', async () => {
			cacheManager.set.mockImplementation(async () => {
				epochs.advance('public')
			})
			mockedFs.unlink.mockImplementation(async (path) => {
				if (path === RSC() || path === RSM()) {
					throw new Error('ENOENT')
				}
			})

			await expect(operation.execute(ctx)).resolves.toMatchObject({ data: processedBuffer })
		})

		it('does not backfill the layered cache from a disk read that a flush overtook', async () => {
			ctx.metaData = metadata()
			mockedFs.readFile.mockResolvedValue(Buffer.from('file-data'))
			epochs.advance('public')

			await expect(operation.loadResource(ctx)).resolves.toMatchObject({
				data: Buffer.from('file-data'),
			})

			expect(cacheManager.set).not.toHaveBeenCalled()
		})

		it('removes a backfill that a flush overtook while it was being written', async () => {
			ctx.metaData = metadata()
			mockedFs.readFile.mockResolvedValue(Buffer.from('file-data'))
			cacheManager.set.mockImplementation(async () => {
				epochs.advance('public')
			})

			await operation.loadResource(ctx)
			await new Promise(resolve => setImmediate(resolve))

			expect(cacheManager.delete).toHaveBeenCalledWith('image:public', RESOURCE_ID)
			expect(mockedFs.unlink).toHaveBeenCalledWith(RSC())
			expect(mockedFs.unlink).toHaveBeenCalledWith(RSM())
		})

		it('leaves a backfill alone when no flush landed', async () => {
			ctx.metaData = metadata()
			mockedFs.readFile.mockResolvedValue(Buffer.from('file-data'))

			await operation.loadResource(ctx)
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
