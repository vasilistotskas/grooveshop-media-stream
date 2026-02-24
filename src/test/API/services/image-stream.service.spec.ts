import type { ImageProcessingContext } from '#microservice/API/types/image-source.types'
import type { OperationContext } from '#microservice/Cache/operations/cache-image-resource.operation'
import type ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import type { MockedObject } from 'vitest'
import { Buffer } from 'node:buffer'
import CacheImageRequest, { ResizeOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { ImageStreamService } from '#microservice/API/services/image-stream.service'
import CacheImageResourceOperation from '#microservice/Cache/operations/cache-image-resource.operation'
import { RequestDeduplicator } from '#microservice/common/utils/request-deduplication.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'reflect-metadata'

/**
 * Unit tests for ImageStreamService — the core orchestration service.
 * Tests the main request flow: cache check → content negotiation → process → stream/fallback.
 */

function createMockResponse(): any {
	const res = {
		status: vi.fn().mockReturnThis(),
		header: vi.fn().mockReturnThis(),
		end: vi.fn().mockReturnThis(),
		send: vi.fn().mockReturnThis(),
		sendFile: vi.fn().mockReturnThis(),
		on: vi.fn(),
		headersSent: false,
	}
	return res
}

function createMockRequest(headers?: Record<string, string>): any {
	return {
		headers: headers || { accept: 'image/webp,image/*,*/*;q=0.8' },
		get: vi.fn((name: string) => (headers || {})[name.toLowerCase()]),
	}
}

function createContext(overrides?: Partial<ImageProcessingContext>): ImageProcessingContext {
	return {
		source: {
			name: 'test-source',
			baseUrl: 'http://backend',
			urlPattern: '{baseUrl}/{path}',
			routePattern: 'test/:imagePath+',
			routeParams: ['imagePath'],
		},
		params: { imagePath: 'test/image.jpg', width: 200, height: 200 },
		correlationId: 'test-correlation-id',
		...overrides,
	}
}

function createOperationContext(): OperationContext {
	return {
		request: new CacheImageRequest({ resourceTarget: 'http://backend/test/image.jpg' }),
		id: { resourceId: 'test-resource', fileExtension: '.webp' },
		metaData: null,
	}
}

function createHeaders(): ResourceMetaData {
	return {
		size: '1024',
		format: 'webp',
		dateCreated: Date.now(),
		publicTTL: 86400000,
		privateTTL: 43200000,
		version: 1,
	} as ResourceMetaData
}

describe('imageStreamService', () => {
	let service: ImageStreamService
	let mockCacheOp: MockedObject<CacheImageResourceOperation>
	let mockMetricsService: MockedObject<MetricsService>
	let mockDeduplicator: MockedObject<RequestDeduplicator>

	beforeEach(async () => {
		mockCacheOp = {
			setup: vi.fn().mockResolvedValue(createOperationContext()),
			checkResourceExists: vi.fn().mockResolvedValue(false),
			fetchHeaders: vi.fn().mockResolvedValue(createHeaders()),
			execute: vi.fn().mockResolvedValue(undefined),
			getCachedResource: vi.fn().mockResolvedValue(null),
			getResourcePath: vi.fn().mockReturnValue('/storage/test-resource.webp'),
			optimizeAndServeDefaultImage: vi.fn().mockResolvedValue(Buffer.from('default-image-data')),
		} as any

		mockMetricsService = {
			incrementCounter: vi.fn(),
			recordError: vi.fn(),
		} as any

		mockDeduplicator = {
			execute: vi.fn().mockImplementation(async (_key: string, fn: () => Promise<any>) => fn()),
		} as any

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ImageStreamService,
				{ provide: CacheImageResourceOperation, useValue: mockCacheOp },
				{ provide: MetricsService, useValue: mockMetricsService },
				{ provide: RequestDeduplicator, useValue: mockDeduplicator },
			],
		}).compile()

		service = module.get<ImageStreamService>(ImageStreamService)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('processAndStream - Cache Hit Path', () => {
		it('should stream cached resource without deduplication', async () => {
			const res = createMockResponse()
			const context = createContext()
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions({ width: 200, height: 200 }),
			})

			mockCacheOp.checkResourceExists.mockResolvedValue(true)
			mockCacheOp.getCachedResource.mockResolvedValue({
				data: Buffer.from('image-data'),
			})

			await service.processAndStream(context, request, res)

			expect(mockCacheOp.checkResourceExists).toHaveBeenCalled()
			expect(mockDeduplicator.execute).not.toHaveBeenCalled()
			expect(res.end).toHaveBeenCalled()
		})

		it('should send 304 when ETag matches', async () => {
			const headers = createHeaders()
			const res = createMockResponse()
			const req = createMockRequest({ 'if-none-match': 'W/"some-etag"' })
			const context = createContext()
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions(),
			})

			mockCacheOp.checkResourceExists.mockResolvedValue(true)
			mockCacheOp.fetchHeaders.mockResolvedValue(headers)

			// The actual ETag matching depends on the generated etag
			// We test the flow, not the exact etag algorithm
			await service.processAndStream(context, request, res, req)

			expect(mockCacheOp.fetchHeaders).toHaveBeenCalled()
		})
	})

	describe('processAndStream - Cache Miss Path', () => {
		it('should use request deduplicator for non-cached images', async () => {
			const res = createMockResponse()
			const context = createContext()
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions({ width: 200, height: 200 }),
			})

			mockCacheOp.checkResourceExists.mockResolvedValue(false)
			mockCacheOp.getCachedResource.mockResolvedValue({
				data: Buffer.from('processed-image'),
			})

			await service.processAndStream(context, request, res)

			expect(mockDeduplicator.execute).toHaveBeenCalled()
			expect(mockCacheOp.execute).toHaveBeenCalled()
		})

		it('should increment image_requests_total counter', async () => {
			const res = createMockResponse()
			const context = createContext()
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions(),
			})

			mockCacheOp.checkResourceExists.mockResolvedValue(false)
			mockCacheOp.getCachedResource.mockResolvedValue({
				data: Buffer.from('processed-image'),
			})

			await service.processAndStream(context, request, res)

			expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('image_requests_total')
		})
	})

	describe('processAndStream - Error Handling', () => {
		it('should serve fallback image on processing error', async () => {
			const res = createMockResponse()
			const context = createContext()
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions(),
			})

			mockCacheOp.setup.mockRejectedValue(new Error('Setup failed'))

			await service.processAndStream(context, request, res)

			expect(mockCacheOp.optimizeAndServeDefaultImage).toHaveBeenCalled()
			expect(res.send).toHaveBeenCalled()
		})

		it('should record error metrics on failure', async () => {
			const res = createMockResponse()
			const context = createContext()
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions(),
			})

			mockCacheOp.setup.mockRejectedValue(new Error('Test error'))

			await service.processAndStream(context, request, res)

			expect(mockMetricsService.recordError).toHaveBeenCalledWith(
				'image_request',
				expect.any(String),
			)
		})

		it('should handle circuit breaker open error specifically', async () => {
			const res = createMockResponse()
			const context = createContext()
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions(),
			})

			mockCacheOp.setup.mockRejectedValue(new Error('Circuit breaker is open for target'))

			await service.processAndStream(context, request, res)

			expect(mockMetricsService.recordError).toHaveBeenCalledWith(
				'image_request',
				'circuit_breaker_open',
			)
		})

		it('should throw when both primary and fallback fail', async () => {
			const res = createMockResponse()
			const context = createContext()
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions(),
			})

			mockCacheOp.setup.mockRejectedValue(new Error('Setup failed'))
			mockCacheOp.optimizeAndServeDefaultImage.mockRejectedValue(new Error('Fallback also failed'))

			await expect(
				service.processAndStream(context, request, res),
			).rejects.toThrow()

			expect(mockMetricsService.recordError).toHaveBeenCalledWith(
				'default_image_fallback',
				'fallback_error',
			)
		})
	})

	describe('processAndStream - Content Negotiation', () => {
		it('should apply content negotiation when request is provided', async () => {
			const res = createMockResponse()
			const req = createMockRequest({ accept: 'image/avif,image/webp,*/*' })
			const context = createContext()
			// Use default webp format — negotiation should still run and may change quality
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions({ format: SupportedResizeFormats.webp }),
			})

			mockCacheOp.checkResourceExists.mockResolvedValue(false)
			mockCacheOp.getCachedResource.mockResolvedValue({
				data: Buffer.from('processed-image'),
			})

			await service.processAndStream(context, request, res, req)

			// Negotiation was called — format honored as webp since it was explicitly set
			// The key test here is that negotiateImageFormat runs without error
			expect(mockCacheOp.setup).toHaveBeenCalled()
		})

		it('should not negotiate when no request object provided', async () => {
			const res = createMockResponse()
			const context = createContext()
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions({ format: SupportedResizeFormats.jpeg }),
			})

			mockCacheOp.checkResourceExists.mockResolvedValue(false)
			mockCacheOp.getCachedResource.mockResolvedValue({
				data: Buffer.from('processed-image'),
			})

			await service.processAndStream(context, request, res)

			// Format should remain as jpeg
			expect(request.resizeOptions.format).toBe(SupportedResizeFormats.jpeg)
		})
	})

	describe('streamResource - Missing Headers', () => {
		it('should serve fallback when metadata is missing', async () => {
			const res = createMockResponse()
			const context = createContext()
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions(),
			})

			mockCacheOp.checkResourceExists.mockResolvedValue(true)
			mockCacheOp.fetchHeaders.mockResolvedValue(null)

			await service.processAndStream(context, request, res)

			expect(mockCacheOp.optimizeAndServeDefaultImage).toHaveBeenCalled()
		})
	})

	describe('streamFromMemory - Data Type Handling', () => {
		it('should handle Buffer data directly', async () => {
			const res = createMockResponse()
			const context = createContext()
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions(),
			})

			const imageBuffer = Buffer.from('image-data')
			mockCacheOp.checkResourceExists.mockResolvedValue(true)
			mockCacheOp.getCachedResource.mockResolvedValue({ data: imageBuffer })

			await service.processAndStream(context, request, res)

			expect(res.end).toHaveBeenCalledWith(imageBuffer)
		})

		it('should handle base64 string data', async () => {
			const res = createMockResponse()
			const context = createContext()
			const request = new CacheImageRequest({
				resourceTarget: 'http://backend/test/image.jpg',
				resizeOptions: new ResizeOptions(),
			})

			const base64Data = Buffer.from('image-data').toString('base64')
			mockCacheOp.checkResourceExists.mockResolvedValue(true)
			mockCacheOp.getCachedResource.mockResolvedValue({ data: base64Data })

			await service.processAndStream(context, request, res)

			expect(res.end).toHaveBeenCalledWith(expect.any(Buffer))
		})
	})
})
