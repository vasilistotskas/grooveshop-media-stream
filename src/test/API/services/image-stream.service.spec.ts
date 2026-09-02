import type { MockedObject } from 'vitest'
import type { ImageProcessingContext } from '#microservice/API/types/image-source.types'
import type { OperationContext } from '#microservice/Cache/operations/cache-image-resource.operation'
import type { ProcessedImage } from '#microservice/Cache/operations/image-format-processor.service'
import { Buffer } from 'node:buffer'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CacheImageRequest, { ResizeOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { ImageStreamService } from '#microservice/API/services/image-stream.service'
import CacheImageResourceOperation from '#microservice/Cache/operations/cache-image-resource.operation'
import { CircuitBreakerOpenError, DefaultImageFallbackError } from '#microservice/common/errors/media-stream.errors'
import { generateWeakETag } from '#microservice/common/utils/etag.util'
import { RequestDeduplicator } from '#microservice/common/utils/request-deduplication.util'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import 'reflect-metadata'

/**
 * ImageStreamService orchestration: cached copy → 304 / stream, miss →
 * deduplicated execute → stream, anything failing → default image.
 */

function createMockResponse(): any {
	return {
		status: vi.fn().mockReturnThis(),
		header: vi.fn().mockReturnThis(),
		end: vi.fn().mockReturnThis(),
		send: vi.fn().mockReturnThis(),
	}
}

function createMockRequest(headers: Record<string, string> = {}): any {
	return { headers }
}

function createContext(): ImageProcessingContext {
	return {
		source: {
			name: 'test-source',
			urlPattern: '{baseUrl}/{path}',
			routePattern: 'test/:imagePath+',
			routeParams: ['imagePath'],
		},
		params: { imagePath: 'test/image.jpg', width: '200', height: '200' },
		correlationId: 'test-correlation-id',
	}
}

function createRequest(format: SupportedResizeFormats = SupportedResizeFormats.webp): CacheImageRequest {
	return new CacheImageRequest({
		resourceTarget: 'http://backend/test/image.jpg',
		resizeOptions: new ResizeOptions({ width: 200, height: 200, format }),
	})
}

function createMetadata(overrides: Partial<ResourceMetaData> = {}): ResourceMetaData {
	return new ResourceMetaData({
		size: '1024',
		format: 'webp',
		dateCreated: 1_700_000_000_000,
		publicTTL: 86_400_000,
		privateTTL: 43_200_000,
		...overrides,
	})
}

function createProcessedImage(content: string, overrides: Partial<ResourceMetaData> = {}): ProcessedImage {
	return { data: Buffer.from(content), metadata: createMetadata(overrides) }
}

function headerValue(res: any, name: string): string | undefined {
	const call = res.header.mock.calls.find(([header]: [string]) => header === name)
	return call?.[1]
}

describe('imageStreamService', () => {
	let service: ImageStreamService
	let cacheOp: MockedObject<CacheImageResourceOperation>
	let metricsService: MockedObject<MetricsService>
	let deduplicator: MockedObject<RequestDeduplicator<ProcessedImage>>
	let opCtx: OperationContext

	/** Make checkResourceExists() report a hit whose payload loadResource() then returns. */
	function primeHit(cached: ProcessedImage, onDisk = false): void {
		cacheOp.checkResourceExists.mockImplementation(async (ctx) => {
			ctx.metaData = cached.metadata
			ctx.cached = onDisk ? null : cached
			return true
		})
		cacheOp.loadResource.mockImplementation(async ctx => ctx.cached ?? cached)
	}

	beforeEach(async () => {
		opCtx = {
			request: new CacheImageRequest({ resourceTarget: 'http://backend/test/image.jpg' }),
			id: 'test-resource',
			metaData: null,
			cached: null,
		}

		cacheOp = {
			setup: vi.fn().mockResolvedValue(opCtx),
			checkResourceExists: vi.fn().mockResolvedValue(false),
			loadResource: vi.fn().mockResolvedValue(null),
			execute: vi.fn().mockResolvedValue(createProcessedImage('processed-image')),
			optimizeAndServeDefaultImage: vi.fn().mockResolvedValue(Buffer.from('default-image-data')),
		} as any

		metricsService = {
			recordImageRequest: vi.fn(),
			recordError: vi.fn(),
		} as any

		deduplicator = {
			execute: vi.fn().mockImplementation(async (_key: string, fn: () => Promise<ProcessedImage>) => fn()),
		} as any

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ImageStreamService,
				{ provide: CacheImageResourceOperation, useValue: cacheOp },
				{ provide: MetricsService, useValue: metricsService },
				{ provide: RequestDeduplicator, useValue: deduplicator },
			],
		}).compile()

		service = module.get<ImageStreamService>(ImageStreamService)
	})

	describe('cache hit', () => {
		it('streams the layered payload kept on the context — no re-fetch, no deduplication, no processing', async () => {
			const res = createMockResponse()
			const cached = createProcessedImage('image-data')
			primeHit(cached)

			await service.processAndStream(createContext(), createRequest(), res)

			expect(cacheOp.loadResource).toHaveBeenCalledWith(opCtx)
			expect(opCtx.cached).toBe(cached)
			expect(res.end).toHaveBeenCalledWith(cached.data)
			expect(deduplicator.execute).not.toHaveBeenCalled()
			expect(cacheOp.execute).not.toHaveBeenCalled()
			expect(cacheOp.optimizeAndServeDefaultImage).not.toHaveBeenCalled()
		})

		it('writes the caching and validation headers from the metadata, without Vary or a correlation header', async () => {
			const res = createMockResponse()
			const cached = createProcessedImage('image-data', { format: 'avif', size: '1024', publicTTL: 86_400_000 })
			primeHit(cached)

			await service.processAndStream(createContext(), createRequest(), res)

			expect(headerValue(res, 'Content-Type')).toBe('image/avif')
			expect(headerValue(res, 'Content-Length')).toBe(String(cached.data.length))
			expect(headerValue(res, 'ETag')).toBe(generateWeakETag('1024', cached.metadata.dateCreated, 'avif'))
			expect(headerValue(res, 'Cache-Control')).toBe('max-age=86400, s-maxage=86400, public, immutable, stale-while-revalidate=604800, stale-if-error=2592000')
			expect(headerValue(res, 'Last-Modified')).toBe(new Date(cached.metadata.dateCreated).toUTCString())
			expect(headerValue(res, 'Expires')).toMatch(/GMT$/)
			expect(headerValue(res, 'X-Content-Type-Options')).toBe('nosniff')
			expect(headerValue(res, 'Vary')).toBeUndefined()
			expect(headerValue(res, 'X-Correlation-ID')).toBeUndefined()
		})

		it('streams a disk-only hit through loadResource', async () => {
			const res = createMockResponse()
			const cached = createProcessedImage('disk-data')
			primeHit(cached, true)

			await service.processAndStream(createContext(), createRequest(), res)

			expect(res.end).toHaveBeenCalledWith(cached.data)
			expect(cacheOp.execute).not.toHaveBeenCalled()
		})

		it('processes again when the cached copy vanished between the check and the read', async () => {
			const res = createMockResponse()
			primeHit(createProcessedImage('gone'), true)
			cacheOp.loadResource.mockResolvedValue(null)
			const processed = createProcessedImage('reprocessed')
			cacheOp.execute.mockResolvedValue(processed)

			await service.processAndStream(createContext(), createRequest(), res)

			expect(deduplicator.execute).toHaveBeenCalledWith(opCtx.id, expect.any(Function))
			expect(res.end).toHaveBeenCalledWith(processed.data)
			expect(cacheOp.optimizeAndServeDefaultImage).not.toHaveBeenCalled()
		})
	})

	describe('conditional requests', () => {
		it('answers a matching If-None-Match with 304 and never loads the payload', async () => {
			const res = createMockResponse()
			const cached = createProcessedImage('image-data')
			primeHit(cached)
			const etag = generateWeakETag(cached.metadata.size, cached.metadata.dateCreated, cached.metadata.format)

			await service.processAndStream(createContext(), createRequest(), res, createMockRequest({ 'if-none-match': etag }))

			expect(res.status).toHaveBeenCalledWith(304)
			expect(headerValue(res, 'ETag')).toBe(etag)
			expect(headerValue(res, 'Cache-Control')).toContain('max-age=86400')
			expect(res.end).toHaveBeenCalledWith()
			expect(cacheOp.loadResource).not.toHaveBeenCalled()
			expect(cacheOp.execute).not.toHaveBeenCalled()
		})

		it('answers an If-Modified-Since at or after the creation time with 304', async () => {
			const res = createMockResponse()
			const cached = createProcessedImage('image-data')
			primeHit(cached)

			await service.processAndStream(createContext(), createRequest(), res, createMockRequest({
				'if-modified-since': new Date(cached.metadata.dateCreated + 60_000).toUTCString(),
			}))

			expect(res.status).toHaveBeenCalledWith(304)
			expect(cacheOp.loadResource).not.toHaveBeenCalled()
		})

		it('streams the full response when the validators do not match', async () => {
			const res = createMockResponse()
			const cached = createProcessedImage('image-data')
			primeHit(cached)

			await service.processAndStream(createContext(), createRequest(), res, createMockRequest({ 'if-none-match': 'W/"stale"' }))

			expect(res.status).not.toHaveBeenCalledWith(304)
			expect(res.end).toHaveBeenCalledWith(cached.data)
		})
	})

	describe('cache miss', () => {
		it('deduplicates on the resource identity and streams the execute result directly', async () => {
			const res = createMockResponse()
			const processed = createProcessedImage('processed-image', { format: 'png', size: '15' })
			cacheOp.execute.mockResolvedValue(processed)

			await service.processAndStream(createContext(), createRequest(), res)

			expect(deduplicator.execute).toHaveBeenCalledWith(opCtx.id, expect.any(Function))
			expect(cacheOp.execute).toHaveBeenCalledWith(opCtx)
			expect(cacheOp.loadResource).not.toHaveBeenCalled()
			expect(res.end).toHaveBeenCalledWith(processed.data)
			expect(headerValue(res, 'Content-Type')).toBe('image/png')
			expect(headerValue(res, 'Content-Length')).toBe(String(processed.data.length))
		})

		it('lets every waiter stream the shared result of one execute', async () => {
			const processed = createProcessedImage('shared')
			cacheOp.execute.mockResolvedValue(processed)
			deduplicator.execute.mockResolvedValue(processed)
			const first = createMockResponse()
			const second = createMockResponse()

			await Promise.all([
				service.processAndStream(createContext(), createRequest(), first),
				service.processAndStream(createContext(), createRequest(), second),
			])

			expect(first.end).toHaveBeenCalledWith(processed.data)
			expect(second.end).toHaveBeenCalledWith(processed.data)
		})

		it('counts every request', async () => {
			await service.processAndStream(createContext(), createRequest(), createMockResponse())

			expect(metricsService.recordImageRequest).toHaveBeenCalledTimes(1)
			expect(metricsService.recordImageRequest).toHaveBeenCalledWith()
		})
	})

	describe('fallback image', () => {
		it('serves the default image when setup fails and records the error by class', async () => {
			const res = createMockResponse()
			const request = createRequest()
			cacheOp.setup.mockRejectedValue(new Error('Setup failed'))

			await service.processAndStream(createContext(), request, res)

			expect(cacheOp.optimizeAndServeDefaultImage).toHaveBeenCalledWith(request.resizeOptions)
			expect(res.header).toHaveBeenCalledWith('Content-Type', 'image/webp')
			expect(res.send).toHaveBeenCalledWith(Buffer.from('default-image-data'))
			expect(metricsService.recordError).toHaveBeenCalledWith('image_request', 'Error')
		})

		it('serves the default image when processing fails after a miss', async () => {
			const res = createMockResponse()
			cacheOp.execute.mockRejectedValue(new Error('upstream exploded'))

			await service.processAndStream(createContext(), createRequest(), res)

			expect(res.send).toHaveBeenCalledWith(Buffer.from('default-image-data'))
			expect(res.end).not.toHaveBeenCalled()
		})

		it('labels the fallback with the format Sharp actually encodes: avif stays avif, svg becomes png', async () => {
			const avifRes = createMockResponse()
			cacheOp.setup.mockRejectedValue(new Error('boom'))
			await service.processAndStream(createContext(), createRequest(SupportedResizeFormats.avif), avifRes)
			expect(avifRes.header).toHaveBeenCalledWith('Content-Type', 'image/avif')

			const svgRes = createMockResponse()
			await service.processAndStream(createContext(), createRequest(SupportedResizeFormats.svg), svgRes)
			expect(svgRes.header).toHaveBeenCalledWith('Content-Type', 'image/png')
		})

		it('recognises an open circuit breaker by type, not by message', async () => {
			const res = createMockResponse()
			cacheOp.setup.mockRejectedValue(new CircuitBreakerOpenError())

			await service.processAndStream(createContext(), createRequest(), res)

			expect(metricsService.recordError).toHaveBeenCalledWith('image_request', 'circuit_breaker_open')
			expect(res.send).toHaveBeenCalledWith(Buffer.from('default-image-data'))

			metricsService.recordError.mockClear()
			cacheOp.setup.mockRejectedValue(new Error('Circuit breaker is open'))
			await service.processAndStream(createContext(), createRequest(), createMockResponse())
			expect(metricsService.recordError).toHaveBeenCalledWith('image_request', 'Error')
		})

		it('propagates DefaultImageFallbackError when the fallback itself fails', async () => {
			const res = createMockResponse()
			cacheOp.setup.mockRejectedValue(new Error('Setup failed'))
			cacheOp.optimizeAndServeDefaultImage.mockRejectedValue(new Error('Fallback also failed'))

			await expect(service.processAndStream(createContext(), createRequest(), res)).rejects.toBeInstanceOf(DefaultImageFallbackError)

			expect(metricsService.recordError).toHaveBeenCalledWith('default_image_fallback', 'fallback_error')
			expect(res.send).not.toHaveBeenCalled()
		})
	})
})
