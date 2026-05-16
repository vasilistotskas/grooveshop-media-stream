import type { Response } from 'express'
import type { MockedObject } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MediaStreamImageController from '#microservice/API/controllers/media-stream-image.controller'
import { ImageStreamService } from '#microservice/API/services/image-stream.service'
import { RequestValidatorService } from '#microservice/API/services/request-validator.service'
import { UrlBuilderService } from '#microservice/API/services/url-builder.service'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'

vi.mock('#microservice/API/services/image-stream.service')
vi.mock('#microservice/API/services/request-validator.service')
vi.mock('#microservice/API/services/url-builder.service')
vi.mock('#microservice/Correlation/services/correlation.service')
vi.mock('#microservice/Metrics/services/metrics.service')
vi.mock('#microservice/RateLimit/guards/adaptive-rate-limit.guard')
vi.mock('#microservice/Correlation/utils/performance-tracker.util', () => ({
	PerformanceTracker: {
		startPhase: vi.fn(),
		endPhase: vi.fn().mockReturnValue(100),
	},
}))

describe('mediaStreamImageController', () => {
	let controller: MediaStreamImageController
	let mockImageStreamService: MockedObject<ImageStreamService>
	let mockRequestValidatorService: MockedObject<RequestValidatorService>
	let mockUrlBuilderService: MockedObject<UrlBuilderService>
	let mockCorrelationService: MockedObject<CorrelationService>
	let mockMetricsService: MockedObject<MetricsService>
	let mockResponse: MockedObject<Response>

	beforeEach(async () => {
		mockImageStreamService = {
			processAndStream: vi.fn().mockResolvedValue(undefined),
		} as any

		mockRequestValidatorService = {
			validateRequest: vi.fn().mockResolvedValue(undefined),
			validateUrl: vi.fn().mockResolvedValue(undefined),
		} as any

		mockUrlBuilderService = {
			buildResourceUrl: vi.fn().mockReturnValue('http://localhost:8000/media/uploads/test/image.webp'),
		} as any

		mockCorrelationService = {
			getCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
		} as any

		mockMetricsService = {
			recordError: vi.fn(),
		} as any

		mockResponse = {
			header: vi.fn().mockReturnThis(),
			sendFile: vi.fn(),
			pipe: vi.fn(),
			on: vi.fn(),
			once: vi.fn(),
			end: vi.fn(),
			write: vi.fn(),
			destroy: vi.fn(),
			writable: true,
			writableEnded: false,
			writableFinished: false,
			locals: {},
		} as any

		const module: TestingModule = await Test.createTestingModule({
			controllers: [MediaStreamImageController],
			providers: [
				{
					provide: ImageStreamService,
					useValue: mockImageStreamService,
				},
				{
					provide: RequestValidatorService,
					useValue: mockRequestValidatorService,
				},
				{
					provide: UrlBuilderService,
					useValue: mockUrlBuilderService,
				},
				{
					provide: CorrelationService,
					useValue: mockCorrelationService,
				},
				{
					provide: MetricsService,
					useValue: mockMetricsService,
				},
			],
		}).compile()

		controller = await module.resolve<MediaStreamImageController>(MediaStreamImageController)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('handleImageRequest', () => {
		it('should handle uploaded media image request', async () => {
			const mockRequest = {
				path: '/media_stream-image/media/uploads/test/image.webp/100/100/contain/entropy/transparent/5/80.webp',
			} as any

			await controller.handleImageRequest(mockRequest, mockResponse)

			expect(mockRequestValidatorService.validateRequest).toHaveBeenCalled()
			expect(mockUrlBuilderService.buildResourceUrl).toHaveBeenCalled()
			expect(mockRequestValidatorService.validateUrl).toHaveBeenCalled()
			expect(mockImageStreamService.processAndStream).toHaveBeenCalled()
			expect(mockResponse.locals.requestedFormat).toBe('webp')
		})

		it('should handle static image request', async () => {
			mockUrlBuilderService.buildResourceUrl.mockReturnValue('http://localhost:8000/static/images/image.webp')
			const mockRequest = {
				path: '/media_stream-image/static/images/image.webp/100/100/contain/entropy/transparent/5/80.webp',
			} as any

			await controller.handleImageRequest(mockRequest, mockResponse)

			expect(mockRequestValidatorService.validateRequest).toHaveBeenCalled()
			expect(mockUrlBuilderService.buildResourceUrl).toHaveBeenCalled()
			expect(mockImageStreamService.processAndStream).toHaveBeenCalled()
		})

		it('should throw NotFoundException for invalid path', async () => {
			const mockRequest = {
				path: '/media_stream-image/invalid/path/that/does/not/match',
			} as any

			await expect(controller.handleImageRequest(mockRequest, mockResponse))
				.rejects
				.toThrow(NotFoundException)
		})

		it('should decode URL-encoded parameters', async () => {
			const mockRequest = {
				path: '/media_stream-image/media/uploads/test%20type/image%20name.webp/100/100/contain/entropy/transparent/5/80.webp',
			} as any

			await controller.handleImageRequest(mockRequest, mockResponse)

			expect(mockRequestValidatorService.validateRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					params: expect.objectContaining({
						imagePath: 'test type/image name.webp',
					}),
				}),
			)
		})

		// Loop-decode legitimate TinyMCE-style double-encoded URLs.
		// Site owner reported on 2026-05-16 that blog cover images were
		// returning ``Double-encoded URL detected`` rejections at high
		// volume; the source is TinyMCE serialising image URLs with
		// percent-encoded slashes (``%2F``) on top of percent-encoded
		// UTF-8 (``%25CF%2584``). Path-traversal defence has moved to
		// ``SecurityCheckerService.containsPathTraversal`` (which
		// multi-decodes and tests every traversal pattern against each
		// decoded variant), so the controller can safely canonicalise
		// the path by looping ``decodeURIComponent`` until stable.
		it('should loop-decode TinyMCE-style double-encoded image paths', async () => {
			// %252F is a double-encoded slash. Loop-decode: pass 1 →
			// "test%2Fpath", pass 2 → "test/path", stable. The regex
			// then matches imagePath="test/path/image.webp" via the
			// :imagePath+ wildcard.
			const mockRequest = {
				path: '/media_stream-image/media/uploads/test%252Fpath/image.webp/100/100/contain/entropy/transparent/5/80.webp',
			} as any

			await controller.handleImageRequest(mockRequest, mockResponse)

			expect(mockRequestValidatorService.validateRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					params: expect.objectContaining({
						imagePath: 'test/path/image.webp',
					}),
				}),
			)
		})

		it('should loop-decode quadruple-encoded Greek bytes (real prod case)', async () => {
			// %25CF%2584 is a double-encoded Greek τ; %2525CF%252584 is
			// quadruple-encoded. Loop terminates within 3 passes for
			// any reasonable input. After the loop the path is the
			// canonical UTF-8 string.
			const mockRequest = {
				path: '/media_stream-image/media/uploads/blog/%2525CF%252584_cover.png/100/100/cover/entropy/transparent/5/80.webp',
			} as any

			await controller.handleImageRequest(mockRequest, mockResponse)

			expect(mockRequestValidatorService.validateRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					params: expect.objectContaining({
						imagePath: 'blog/τ_cover.png',
					}),
				}),
			)
		})

		it('should 404 a deeply double-encoded path traversal attempt', async () => {
			// %25252e%25252e%2525252f loop-decodes to "../". The
			// resulting path does not start with ``media/uploads/`` /
			// ``static/images/`` so no IMAGE_SOURCES regex matches and
			// the request returns 404 — safe outcome. If a traversal
			// attempt happened to match the regex, the param-level
			// SecurityCheckerService would catch it.
			const mockRequest = {
				path: '/media_stream-image/%25252e%25252e%2525252f/image.webp/100/100/contain/entropy/transparent/5/80.webp',
			} as any

			await expect(controller.handleImageRequest(mockRequest, mockResponse))
				.rejects
				.toThrow(NotFoundException)
		})

		it('should reject malformed percent-encoding with 400', async () => {
			// ``%ZZ`` is not valid percent-encoding — decodeURIComponent
			// throws, and we surface it as a 400.
			const mockRequest = {
				path: '/media_stream-image/media/uploads/test%ZZpath/image.webp/100/100/contain/entropy/transparent/5/80.webp',
			} as any

			await expect(controller.handleImageRequest(mockRequest, mockResponse))
				.rejects
				.toThrow('Invalid URL encoding in image path')
		})

		it('should decode URL-encoded Unicode characters (Greek)', async () => {
			// Test with Greek characters as sent by Facebook/Twitter crawlers
			// URL: /media/uploads/blog/πωσ_cover.png/1200/630/cover/entropy/transparent/5/80.png
			// Encoded: /media/uploads/blog/%CF%80%CF%89%CF%83_cover.png/1200/630/cover/entropy/transparent/5/80.png
			const mockRequest = {
				path: '/media_stream-image/media/uploads/blog/%CF%80%CF%89%CF%83_cover.png/1200/630/cover/entropy/transparent/5/80.png',
			} as any

			await controller.handleImageRequest(mockRequest, mockResponse)

			expect(mockRequestValidatorService.validateRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					params: expect.objectContaining({
						imagePath: 'blog/πωσ_cover.png', // Should be decoded to Greek characters
					}),
				}),
			)
		})

		it('should handle validation errors', async () => {
			mockRequestValidatorService.validateRequest.mockRejectedValue(
				new Error('Invalid parameters'),
			)
			const mockRequest = {
				path: '/media_stream-image/media/uploads/test/image.webp/100/100/contain/entropy/transparent/5/80.webp',
			} as any

			await expect(controller.handleImageRequest(mockRequest, mockResponse))
				.rejects
				.toThrow('Invalid parameters')

			expect(mockMetricsService.recordError).toHaveBeenCalled()
		})

		it('should handle URL building errors', async () => {
			mockUrlBuilderService.buildResourceUrl.mockImplementation(() => {
				throw new Error('URL building failed')
			})
			const mockRequest = {
				path: '/media_stream-image/media/uploads/test/image.webp/100/100/contain/entropy/transparent/5/80.webp',
			} as any

			await expect(controller.handleImageRequest(mockRequest, mockResponse))
				.rejects
				.toThrow('URL building failed')

			expect(mockMetricsService.recordError).toHaveBeenCalled()
		})

		it('should set response locals correctly', async () => {
			const mockRequest = {
				path: '/media_stream-image/static/images/logo.png/200/200/contain/center/white/5/90.png',
			} as any

			await controller.handleImageRequest(mockRequest, mockResponse)

			expect(mockResponse.locals.requestedFormat).toBe('png')
			expect(mockResponse.locals.originalUrl).toBeDefined()
		})

		it('should handle null width and height', async () => {
			const mockRequest = {
				path: '/media_stream-image/media/uploads/test/image.webp/null/null/contain/entropy/transparent/5/80.webp',
			} as any

			await controller.handleImageRequest(mockRequest, mockResponse)

			expect(mockRequestValidatorService.validateRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					params: expect.objectContaining({
						width: null,
						height: null,
					}),
				}),
			)
		})
	})
})
