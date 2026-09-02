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
import { UpstreamResourceTooLargeError } from '#microservice/common/errors/media-stream.errors'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import ManipulationJobResult from '#microservice/Processing/dto/manipulation-job-result.dto'
import FetchResourceResponseJob from '#microservice/Processing/jobs/fetch-resource-response.job'
import GenerateResourceIdentityFromRequestJob from '#microservice/Processing/jobs/generate-resource-identity-from-request.job'
import WebpImageManipulationJob from '#microservice/Processing/jobs/webp-image-manipulation.job'
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

function streamResponse(): any {
	return {
		status: 200,
		statusText: 'OK',
		headers: { 'content-type': 'image/jpeg' },
		data: Readable.from([Buffer.from('mock-image-data')]),
		config: { url: 'https://example.com/image.jpg', method: 'GET' },
	}
}

/** A non-SVG header for detectSvgByHeader(). */
function mockRasterHeader(): void {
	mockedFs.open.mockResolvedValue({
		read: vi.fn(async (buffer: Buffer) => ({ bytesRead: buffer.write('PNG\r\n', 0, 'utf8'), buffer })),
		close: vi.fn().mockResolvedValue(undefined),
	} as any)
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
	let storageDir: string
	let request: CacheImageRequest
	let ctx: OperationContext
	const processedBuffer = Buffer.from('optimized-image-data')

	beforeEach(async () => {
		vi.resetAllMocks()
		mockCreateWriteStream.mockImplementation(() => new Writable({ write: (_chunk, _encoding, callback) => callback() }) as any)
		mockedFs.writeFile.mockResolvedValue()
		mockedFs.rename.mockResolvedValue()
		mockedFs.unlink.mockResolvedValue()
		mockRasterHeader()

		request = new CacheImageRequest({
			resourceTarget: 'https://example.com/image.jpg',
			resizeOptions: new ResizeOptions({ width: 100, height: 100, quality: 80, format: SupportedResizeFormats.webp, trimThreshold: 10 }),
		})

		identityJob = { handle: vi.fn().mockResolvedValue(RESOURCE_ID) } as any
		fetchJob = { handle: vi.fn().mockImplementation(async () => streamResponse()) } as any
		webpJob = {
			handle: vi.fn().mockResolvedValue(new ManipulationJobResult({ format: 'webp', size: '1000', buffer: processedBuffer })),
		} as any
		cacheManager = {
			get: vi.fn().mockResolvedValue(null),
			set: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
			exists: vi.fn().mockResolvedValue(false),
		} as any
		validation = { validateFileSize: vi.fn().mockReturnValue(true) } as any
		tracker = { record: vi.fn(), flush: vi.fn() } as any
		metricsService = {
			recordCacheOperation: vi.fn(),
			recordImageProcessing: vi.fn(),
			recordError: vi.fn(),
		} as any

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
				{ provide: MultiLayerCacheManager, useValue: cacheManager },
				{ provide: ResourceValidationService, useValue: validation },
				{ provide: AccessCountTracker, useValue: tracker },
				{ provide: MetricsService, useValue: metricsService },
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
			expect(operation.getResourceTempPath(ctx)).toBe(join(storageDir, `${RESOURCE_ID}.rst`))
			expect(operation.getResourceMetaPath(ctx)).toBe(join(storageDir, `${RESOURCE_ID}.rsm`))
		})
	})

	describe('setup', () => {
		it('returns a context with the generated identity and nothing loaded yet', () => {
			expect(identityJob.handle).toHaveBeenCalledWith(request)
			expect(ctx).toEqual({ request, id: RESOURCE_ID, metaData: null, cached: null })
		})

		it('records a validation error and rethrows when identity generation fails', async () => {
			identityJob.handle.mockRejectedValueOnce(new Error('hash failed'))

			await expect(operation.setup(request)).rejects.toThrow('hash failed')
			expect(metricsService.recordError).toHaveBeenCalledWith('validation', 'setup')
		})
	})

	describe('checkResourceExists', () => {
		it('keeps a valid layered hit on the context and records no cache metric of its own', async () => {
			const cached: ProcessedImage = { data: Buffer.from('cached-data'), metadata: metadata() }
			cacheManager.get.mockResolvedValue(cached)

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(true)

			expect(cacheManager.get).toHaveBeenCalledWith('image:public', RESOURCE_ID)
			expect(ctx.cached).toBe(cached)
			expect(ctx.metaData).toBe(cached.metadata)
			expect(mockedFs.readFile).not.toHaveBeenCalled()
			// The manager records the layered tier itself
			expect(metricsService.recordCacheOperation).not.toHaveBeenCalled()
		})

		it('uses the tenant namespace of the request', async () => {
			request.tenantSchema = 'acme'
			ctx = await operation.setup(request)
			mockedFs.readFile.mockRejectedValue(new Error('ENOENT'))

			await operation.checkResourceExists(ctx)

			expect(cacheManager.get).toHaveBeenCalledWith('image:acme', RESOURCE_ID)
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'miss', expect.any(Number), 'acme')
		})

		it('deletes a corrupted layered entry and falls through to the disk check', async () => {
			cacheManager.get.mockResolvedValue({ data: Buffer.from('x'), metadata: {} })
			mockedFs.readFile.mockRejectedValue(new Error('ENOENT'))

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(cacheManager.delete).toHaveBeenCalledWith('image:public', RESOURCE_ID)
			expect(ctx.cached).toBeNull()
		})

		it('deletes an expired layered entry and falls through to the disk check', async () => {
			cacheManager.get.mockResolvedValue({ data: Buffer.from('x'), metadata: metadata({ dateCreated: Date.now() - 7 * MONTH_MS }) })
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
			expect(metricsService.recordCacheOperation).toHaveBeenCalledTimes(1)
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'hit', expect.any(Number), 'public')
		})

		it('records the filesystem duration in seconds', async () => {
			vi.spyOn(PerformanceTracker, 'endPhase').mockReturnValue(250)
			mockedFs.readFile.mockResolvedValue(JSON.stringify(metadata()))
			mockedFs.access.mockResolvedValue()

			await operation.checkResourceExists(ctx)

			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'hit', 0.25, 'public')
		})

		it('is a miss without a sidecar', async () => {
			mockedFs.readFile.mockRejectedValue(new Error('ENOENT'))

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(mockedFs.access).not.toHaveBeenCalled()
			expect(ctx.metaData).toBeNull()
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'miss', expect.any(Number), 'public')
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
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'miss', expect.any(Number), 'public')
		})

		it('never throws: an unexpected failure is a recorded miss', async () => {
			cacheManager.get.mockRejectedValue(new Error('Cache error'))

			await expect(operation.checkResourceExists(ctx)).resolves.toBe(false)

			expect(metricsService.recordError).toHaveBeenCalledWith('cache_check', 'resource_exists')
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'error', expect.any(Number), 'public')
		})
	})

	describe('loadResource', () => {
		it('returns the layered payload without touching the disk and counts the access', async () => {
			const cached: ProcessedImage = { data: Buffer.from('cached-data'), metadata: metadata() }
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
			expect(result).toEqual({ data: Buffer.from('file-data'), metadata: ctx.metaData })
			expect(cacheManager.set).toHaveBeenCalledWith('image:public', RESOURCE_ID, result, 6 * 30 * 24 * 3600)
			expect(tracker.record).toHaveBeenCalledWith(operation.getResourceMetaPath(ctx))
			releaseSet()
		})

		it('survives a failing backfill', async () => {
			ctx.metaData = metadata()
			mockedFs.readFile.mockResolvedValue(Buffer.from('file-data'))
			cacheManager.set.mockRejectedValue(new Error('redis down'))

			await expect(operation.loadResource(ctx)).resolves.toMatchObject({ data: Buffer.from('file-data') })
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
			expect(result.metadata).toMatchObject({ version: 1, size: '1000', format: 'webp', tenantSchema: 'public' })
			expect(cacheManager.set).toHaveBeenCalledWith('image:public', RESOURCE_ID, result, 6 * 30 * 24 * 3600)
			expect(metricsService.recordImageProcessing).toHaveBeenCalledWith('process', 'webp', 'success', expect.any(Number), 'public')
		})

		it('writes the .rsc/.rsm pair atomically, counts the write as the first access and removes the temp file', async () => {
			const resourcePath = operation.getResourcePath(ctx)
			const metaPath = operation.getResourceMetaPath(ctx)

			const result = await operation.execute(ctx)

			expect(mockedFs.writeFile).toHaveBeenCalledTimes(2)
			expect(mockedFs.writeFile).toHaveBeenCalledWith(`${resourcePath}.tmp`, processedBuffer)
			expect(mockedFs.writeFile).toHaveBeenCalledWith(`${metaPath}.tmp`, JSON.stringify(result.metadata), 'utf8')
			expect(mockedFs.rename).toHaveBeenCalledWith(`${resourcePath}.tmp`, resourcePath)
			expect(mockedFs.rename).toHaveBeenCalledWith(`${metaPath}.tmp`, metaPath)
			expect(Math.max(...mockedFs.writeFile.mock.invocationCallOrder)).toBeLessThan(Math.min(...mockedFs.rename.mock.invocationCallOrder))
			expect(tracker.record).toHaveBeenCalledWith(metaPath)
			expect(tracker.record.mock.invocationCallOrder[0]).toBeGreaterThan(Math.max(...mockedFs.rename.mock.invocationCallOrder))
			expect(mockedFs.unlink).toHaveBeenCalledWith(operation.getResourceTempPath(ctx))
		})

		it('routes an SVG source through the SVG path', async () => {
			mockedFs.open.mockResolvedValue({
				read: vi.fn(async (buffer: Buffer) => ({ bytesRead: buffer.write('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>', 0, 'utf8'), buffer })),
				close: vi.fn().mockResolvedValue(undefined),
			} as any)
			mockedFs.readFile.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')

			await operation.execute(ctx)

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
			expect(metricsService.recordImageProcessing).toHaveBeenCalledWith('process', 'unknown', 'error', expect.any(Number), 'public')
			expect(metricsService.recordImageProcessing).toHaveBeenCalledWith('execute', 'unknown', 'error', expect.any(Number), 'public')
		})

		it('propagates typed errors unchanged so the caller sees their HTTP status', async () => {
			validation.validateFileSize.mockReturnValue(false)
			fetchJob.handle.mockResolvedValue({ ...streamResponse(), headers: { 'content-length': '50000000' } })

			await expect(operation.execute(ctx)).rejects.toBeInstanceOf(UpstreamResourceTooLargeError)
			expect(metricsService.recordImageProcessing).toHaveBeenCalledWith('execute', 'unknown', 'error', expect.any(Number), 'public')
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
				expect.objectContaining({ width: 100, height: 100, format: 'webp', quality: 100 }),
			)
		})
	})

	describe('negative cache TTL', () => {
		it('suppresses the fetch for an entry within the TTL window', async () => {
			const t0 = 1_700_000_000_000
			vi.useFakeTimers()
			vi.setSystemTime(t0)
			cacheManager.get.mockImplementation(async (_ns, key) => key === `negative:${RESOURCE_ID}` ? { status: 404, timestamp: t0 } : null)

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
