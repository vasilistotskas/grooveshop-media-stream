import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import MediaStreamImageRESTController from '@microservice/API/Controller/MediaStreamImageRESTController'
import { BackgroundOptions, FitOptions, PositionOptions, SupportedResizeFormats } from '@microservice/API/DTO/CacheImageRequest'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import ResourceMetaData from '@microservice/DTO/ResourceMetaData'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import { InputSanitizationService } from '@microservice/Validation/services/input-sanitization.service'
import { SecurityCheckerService } from '@microservice/Validation/services/security-checker.service'
import { HttpService } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import { Request, Response } from 'express'

jest.mock('@nestjs/axios')
jest.mock('@microservice/Job/GenerateResourceIdentityFromRequestJob')
jest.mock('@microservice/Operation/CacheImageResourceOperation')
jest.mock('@microservice/Validation/services/input-sanitization.service')
jest.mock('@microservice/Validation/services/security-checker.service')
jest.mock('@microservice/Correlation/services/correlation.service')
jest.mock('@microservice/Metrics/services/metrics.service')
jest.mock('@microservice/RateLimit/guards/adaptive-rate-limit.guard')
jest.mock('@microservice/Correlation/utils/performance-tracker.util', () => ({
	PerformanceTracker: {
		startPhase: jest.fn(),
		endPhase: jest.fn().mockReturnValue(100),
	},
}))
jest.mock('node:fs/promises', () => {
	return {
		open: jest.fn().mockImplementation(() => {
			return Promise.resolve({
				createReadStream: jest.fn().mockImplementation(() => {
					const mockReadStream = new Readable()
					mockReadStream.push('mock file content')
					mockReadStream.push(null)

					// Mock the pipe method to simulate successful streaming
					mockReadStream.pipe = jest.fn().mockImplementation((dest) => {
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
				close: jest.fn().mockResolvedValue(undefined),
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
	let mockHttpService: jest.Mocked<HttpService>
	let mockGenerateResourceIdentityFromRequestJob: jest.Mocked<GenerateResourceIdentityFromRequestJob>
	let mockCacheImageResourceOperation: jest.Mocked<CacheImageResourceOperation>
	let mockInputSanitizationService: jest.Mocked<InputSanitizationService>
	let mockSecurityCheckerService: jest.Mocked<SecurityCheckerService>
	let mockCorrelationService: jest.Mocked<CorrelationService>
	let mockMetricsService: jest.Mocked<MetricsService>
	let mockResponse: jest.Mocked<Response>
	let mockRequest: jest.Mocked<Request>

	beforeEach(async () => {
		mockHttpService = {
			get: jest.fn(),
		} as any

		mockGenerateResourceIdentityFromRequestJob = {
			handle: jest.fn(),
		} as any

		mockCacheImageResourceOperation = {
			setup: jest.fn(),
			execute: jest.fn(),
			optimizeAndServeDefaultImage: jest.fn(),
		} as any

		mockInputSanitizationService = {
			sanitize: jest.fn().mockImplementation(str => Promise.resolve(str)),
			validateUrl: jest.fn().mockReturnValue(true),
		} as any

		mockSecurityCheckerService = {
			checkForMaliciousContent: jest.fn().mockResolvedValue(false),
		} as any

		mockCorrelationService = {
			getCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
		} as any

		mockMetricsService = {
			recordError: jest.fn(),
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
			header: jest.fn().mockReturnThis(),
			sendFile: jest.fn(),
			pipe: jest.fn(),
			on: jest.fn(),
			once: jest.fn(),
			end: jest.fn(),
			write: jest.fn(),
			destroy: jest.fn(),
			writable: true,
			writableEnded: false,
			writableFinished: false,
		} as any

		mockRequest = {
			ip: '127.0.0.1',
			headers: {},
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
		jest.clearAllMocks()
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
			expect(mockResponse.header).toHaveBeenCalledWith('Cache-Control', 'max-age=3600, public')
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
				controller.testAddHeadersToRequest(mockResponse, undefined)
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
			mockCacheImageResourceOperation.getCachedResource = jest.fn().mockResolvedValue({
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
				mockRequest,
				mockResponse,
			)

			expect(mockSecurityCheckerService.checkForMaliciousContent).toHaveBeenCalledWith('test')
			expect(mockSecurityCheckerService.checkForMaliciousContent).toHaveBeenCalledWith('image.webp')
			expect(mockInputSanitizationService.validateUrl).toHaveBeenCalled()
			expect(mockCacheImageResourceOperation.setup).toHaveBeenCalled()
			expect(mockCacheImageResourceOperation.execute).toHaveBeenCalled()
			expect(mockResponse.header).toHaveBeenCalledWith('Content-Length', '1000')
			expect(mockResponse.header).toHaveBeenCalledWith('Cache-Control', 'max-age=3600, public')
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
				mockRequest,
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
				mockRequest,
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
			mockCacheImageResourceOperation.getCachedResource = jest.fn().mockResolvedValue({
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
				mockRequest,
				mockResponse,
			)

			expect(mockSecurityCheckerService.checkForMaliciousContent).toHaveBeenCalledWith('image.webp')
			expect(mockInputSanitizationService.validateUrl).toHaveBeenCalled()
			expect(mockCacheImageResourceOperation.setup).toHaveBeenCalled()
			expect(mockCacheImageResourceOperation.execute).toHaveBeenCalled()
			expect(mockResponse.header).toHaveBeenCalledWith('Content-Length', '1000')
			expect(mockResponse.header).toHaveBeenCalledWith('Cache-Control', 'max-age=3600, public')
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
				mockRequest,
				mockResponse,
			)).rejects.toThrow('Invalid quality parameter')

			expect(mockMetricsService.recordError).toHaveBeenCalledWith('static_image_request', expect.any(String))
		})
	})
})
