import type { Response } from 'express'
import type { MockedObject } from 'vitest'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import MediaStreamImageRESTController from '@microservice/API/controllers/media-stream-image-rest.controller'
import { BackgroundOptions, FitOptions, PositionOptions, SupportedResizeFormats } from '@microservice/API/dto/cache-image-request.dto'
import CacheImageResourceOperation from '@microservice/Cache/operations/cache-image-resource.operation'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import ResourceMetaData from '@microservice/HTTP/dto/resource-meta-data.dto'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import GenerateResourceIdentityFromRequestJob from '@microservice/Queue/jobs/generate-resource-identity-from-request.job'
import { InputSanitizationService } from '@microservice/Validation/services/input-sanitization.service'
import { SecurityCheckerService } from '@microservice/Validation/services/security-checker.service'
import { HttpService } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@nestjs/axios')
vi.mock('@microservice/Queue/jobs/generate-resource-identity-from-request.job')
vi.mock('@microservice/Cache/operations/cache-image-resource.operation')
vi.mock('@microservice/Validation/services/input-sanitization.service')
vi.mock('@microservice/Validation/services/security-checker.service')
vi.mock('@microservice/Correlation/services/correlation.service')
vi.mock('@microservice/Metrics/services/metrics.service')
vi.mock('@microservice/RateLimit/guards/adaptive-rate-limit.guard')
vi.mock('@microservice/Correlation/utils/performance-tracker.util', () => ({
	PerformanceTracker: {
		startPhase: vi.fn(),
		endPhase: vi.fn().mockReturnValue(100),
	},
}))
vi.mock('node:fs/promises', () => {
	return {
		open: vi.fn().mockImplementation(() => {
			return Promise.resolve({
				createReadStream: vi.fn().mockImplementation(() => {
					const mockReadStream = new Readable()
					mockReadStream.push('mock file content')
					mockReadStream.push(null)

					// Mock the pipe method to simulate successful streaming
					mockReadStream.pipe = vi.fn().mockImplementation((dest) => {
						// Simulate successful streaming by calling end event
						setTimeout(() => {
							if (mockReadStream.listenerCount('end') > 0) {
								mockReadStream.emit('end')
							}
						}, 0)
						return dest
					})

					return mockReadStream
				}),
				close: vi.fn().mockResolvedValue(undefined),
			})
		}),
	}
})

class TestMediaStreamImageRESTController extends MediaStreamImageRESTController {
	public testAddHeadersToRequest(res: Response, headers: ResourceMetaData): Response {
		return this.addHeadersToRequest(res, headers)
	}
}

describe('mediaStreamImageRESTController', () => {
	let controller: TestMediaStreamImageRESTController
	let mockHttpService: MockedObject<HttpService>
	let mockGenerateResourceIdentityFromRequestJob: MockedObject<GenerateResourceIdentityFromRequestJob>
	let mockCacheImageResourceOperation: MockedObject<CacheImageResourceOperation>
	let mockInputSanitizationService: MockedObject<InputSanitizationService>
	let mockSecurityCheckerService: MockedObject<SecurityCheckerService>
	let mockCorrelationService: MockedObject<CorrelationService>
	let mockMetricsService: MockedObject<MetricsService>
	let mockResponse: MockedObject<Response>

	beforeEach(async () => {
		mockHttpService = {
			get: vi.fn(),
		} as any

		mockGenerateResourceIdentityFromRequestJob = {
			handle: vi.fn(),
		} as any

		mockCacheImageResourceOperation = {
			setup: vi.fn(),
			execute: vi.fn(),
			optimizeAndServeDefaultImage: vi.fn(),
		} as any

		mockInputSanitizationService = {
			sanitize: vi.fn().mockImplementation(str => Promise.resolve(str)),
			validateUrl: vi.fn().mockReturnValue(true),
		} as any

		mockSecurityCheckerService = {
			checkForMaliciousContent: vi.fn().mockResolvedValue(false),
		} as any

		mockCorrelationService = {
			getCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
		} as any

		mockMetricsService = {
			recordError: vi.fn(),
		} as any

		Object.defineProperty(mockCacheImageResourceOperation, 'resourceExists', {
			value: false,
			writable: true,
		})

		Object.defineProperty(mockCacheImageResourceOperation, 'getHeaders', {
			value: null,
			writable: true,
		})

		Object.defineProperty(mockCacheImageResourceOperation, 'getResourcePath', {
			value: '',
			writable: true,
		})

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
			controllers: [TestMediaStreamImageRESTController],
			providers: [
				{
					provide: HttpService,
					useValue: mockHttpService,
				},
				{
					provide: GenerateResourceIdentityFromRequestJob,
					useValue: mockGenerateResourceIdentityFromRequestJob,
				},
				{
					provide: CacheImageResourceOperation,
					useValue: mockCacheImageResourceOperation,
				},
				{
					provide: InputSanitizationService,
					useValue: mockInputSanitizationService,
				},
				{
					provide: SecurityCheckerService,
					useValue: mockSecurityCheckerService,
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

		controller = await module.resolve<TestMediaStreamImageRESTController>(TestMediaStreamImageRESTController)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('addHeadersToRequest', () => {
		it('should add headers to response with correlation ID', () => {
			const headers: ResourceMetaData = {
				size: '1000',
				format: 'webp',
				publicTTL: 3600000,
				version: 1,
				dateCreated: Date.now(),
				privateTTL: 0,
			}

			controller.testAddHeadersToRequest(mockResponse, headers)

			expect(mockResponse.header).toHaveBeenCalledWith('Content-Length', '1000')
			expect(mockResponse.header).toHaveBeenCalledWith('Cache-Control', 'max-age=3600, public, immutable')
			expect(mockResponse.header).toHaveBeenCalledWith('Vary', 'Accept-Encoding')
			expect(mockResponse.header).toHaveBeenCalledWith('Content-Type', 'image/webp')
			expect(mockResponse.header).toHaveBeenCalledWith('X-Correlation-ID', 'test-correlation-id')
		})

		it('should handle SVG format', () => {
			const headers: ResourceMetaData = {
				size: '1000',
				format: 'svg',
				publicTTL: 3600000,
				version: 1,
				dateCreated: Date.now(),
				privateTTL: 0,
			}

			controller.testAddHeadersToRequest(mockResponse, headers)

			expect(mockResponse.header).toHaveBeenCalledWith('Content-Type', 'image/svg+xml')
			expect(mockResponse.header).toHaveBeenCalledWith('X-Correlation-ID', 'test-correlation-id')
		})

		it('should throw error if headers are undefined', () => {
			expect(() => {
				controller.testAddHeadersToRequest(mockResponse, undefined as any)
			}).toThrow('Headers object is undefined')
		})
	})

	describe('uploadedImage', () => {
		it('should handle successful image request with validation and metrics', async () => {
			const headers: ResourceMetaData = {
				size: '1000',
				format: 'webp',
				publicTTL: 3600000,
				version: 1,
				dateCreated: Date.now(),
				privateTTL: 0,
			}

			Object.defineProperty(mockCacheImageResourceOperation, 'resourceExists', {
				value: true,
			})

			Object.defineProperty(mockCacheImageResourceOperation, 'getHeaders', {
				value: Promise.resolve(headers),
			})

			Object.defineProperty(mockCacheImageResourceOperation, 'getResourcePath', {
				value: '/path/to/image.webp',
			})

			// Mock getCachedResource to return cached data so headers are set
			mockCacheImageResourceOperation.getCachedResource = vi.fn().mockResolvedValue({
				data: Buffer.from('fake-image-data').toString('base64'),
			})

			await controller.uploadedImage(
				'test',
				'image.webp',
				100,
				100,
				FitOptions.contain,
				PositionOptions.entropy,
				BackgroundOptions.transparent,
				5,
				SupportedResizeFormats.webp,
				80,
				mockResponse,
			)

			expect(mockSecurityCheckerService.checkForMaliciousContent).toHaveBeenCalledWith('test')
			expect(mockSecurityCheckerService.checkForMaliciousContent).toHaveBeenCalledWith('image.webp')
			expect(mockInputSanitizationService.validateUrl).toHaveBeenCalled()
			expect(mockCacheImageResourceOperation.setup).toHaveBeenCalled()
			expect(mockCacheImageResourceOperation.execute).toHaveBeenCalled()
			expect(mockResponse.header).toHaveBeenCalledWith('Content-Length', '1000')
			expect(mockResponse.header).toHaveBeenCalledWith('Cache-Control', 'max-age=3600, public, immutable')
			expect(mockResponse.header).toHaveBeenCalledWith('Vary', 'Accept-Encoding')
			expect(mockResponse.header).toHaveBeenCalledWith('Content-Type', 'image/webp')
			expect(mockResponse.header).toHaveBeenCalledWith('X-Correlation-ID', 'test-correlation-id')
			// Verify response was sent with cached data (not filesystem streaming)
			expect(mockResponse.end).toHaveBeenCalled()
		})

		it('should handle resource not found with metrics', async () => {
			Object.defineProperty(mockCacheImageResourceOperation, 'resourceExists', {
				value: false,
			})

			Object.defineProperty(mockCacheImageResourceOperation, 'getHeaders', {
				value: null,
			})

			mockCacheImageResourceOperation.optimizeAndServeDefaultImage.mockResolvedValue('/path/to/default.webp')

			await controller.uploadedImage(
				'test',
				'image.webp',
				100,
				100,
				FitOptions.contain,
				PositionOptions.entropy,
				BackgroundOptions.transparent,
				5,
				SupportedResizeFormats.webp,
				80,
				mockResponse,
			)

			expect(mockCacheImageResourceOperation.setup).toHaveBeenCalled()
			expect(mockCacheImageResourceOperation.execute).toHaveBeenCalled()
			expect(mockResponse.sendFile).toHaveBeenCalledWith('/path/to/default.webp')
			expect(mockResponse.header).toHaveBeenCalledWith('X-Correlation-ID', 'test-correlation-id')
		})

		it('should validate parameters and throw error for invalid width', async () => {
			await expect(controller.uploadedImage(
				'test',
				'image.webp',
				-1, // Invalid width
				100,
				FitOptions.contain,
				PositionOptions.entropy,
				BackgroundOptions.transparent,
				5,
				SupportedResizeFormats.webp,
				80,
				mockResponse,
			)).rejects.toThrow('Invalid width parameter')

			expect(mockMetricsService.recordError).toHaveBeenCalledWith('uploaded_image_request', expect.any(String))
		})
	})

	describe('staticImage', () => {
		it('should handle successful static image request with validation and metrics', async () => {
			const headers: ResourceMetaData = {
				size: '1000',
				format: 'webp',
				publicTTL: 3600000,
				version: 1,
				dateCreated: Date.now(),
				privateTTL: 0,
			}

			Object.defineProperty(mockCacheImageResourceOperation, 'resourceExists', {
				value: true,
			})

			Object.defineProperty(mockCacheImageResourceOperation, 'getHeaders', {
				value: Promise.resolve(headers),
			})

			Object.defineProperty(mockCacheImageResourceOperation, 'getResourcePath', {
				value: '/path/to/image.webp',
			})

			// Mock getCachedResource to return cached data so headers are set
			mockCacheImageResourceOperation.getCachedResource = vi.fn().mockResolvedValue({
				data: Buffer.from('fake-image-data').toString('base64'),
			})

			await controller.staticImage(
				'image.webp',
				100,
				100,
				FitOptions.contain,
				PositionOptions.entropy,
				BackgroundOptions.transparent,
				5,
				SupportedResizeFormats.webp,
				80,
				mockResponse,
			)

			expect(mockSecurityCheckerService.checkForMaliciousContent).toHaveBeenCalledWith('image.webp')
			expect(mockInputSanitizationService.validateUrl).toHaveBeenCalled()
			expect(mockCacheImageResourceOperation.setup).toHaveBeenCalled()
			expect(mockCacheImageResourceOperation.execute).toHaveBeenCalled()
			expect(mockResponse.header).toHaveBeenCalledWith('Content-Length', '1000')
			expect(mockResponse.header).toHaveBeenCalledWith('Cache-Control', 'max-age=3600, public, immutable')
			expect(mockResponse.header).toHaveBeenCalledWith('Vary', 'Accept-Encoding')
			expect(mockResponse.header).toHaveBeenCalledWith('Content-Type', 'image/webp')
			expect(mockResponse.header).toHaveBeenCalledWith('X-Correlation-ID', 'test-correlation-id')
			// Verify response was sent with cached data (not filesystem streaming)
			expect(mockResponse.end).toHaveBeenCalled()
		})

		it('should validate parameters and throw error for invalid quality', async () => {
			await expect(controller.staticImage(
				'image.webp',
				100,
				100,
				FitOptions.contain,
				PositionOptions.entropy,
				BackgroundOptions.transparent,
				5,
				SupportedResizeFormats.webp,
				150, // Invalid quality
				mockResponse,
			)).rejects.toThrow('Invalid quality parameter')

			expect(mockMetricsService.recordError).toHaveBeenCalledWith('static_image_request', expect.any(String))
		})
	})
})
