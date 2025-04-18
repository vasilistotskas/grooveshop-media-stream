import * as fs from 'node:fs/promises'
import { Readable } from 'node:stream'
import MediaStreamImageRESTController from '@microservice/API/Controller/MediaStreamImageRESTController'
import { BackgroundOptions, FitOptions, PositionOptions, SupportedResizeFormats } from '@microservice/API/DTO/CacheImageRequest'
import ResourceMetaData from '@microservice/DTO/ResourceMetaData'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import { HttpService } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import { Response } from 'express'

jest.mock('@nestjs/axios')
jest.mock('@microservice/Job/GenerateResourceIdentityFromRequestJob')
jest.mock('@microservice/Operation/CacheImageResourceOperation')
jest.mock('node:fs/promises', () => {
	return {
		open: jest.fn().mockImplementation(() => {
			return Promise.resolve({
				createReadStream: jest.fn().mockImplementation(() => {
					const mockReadStream = new Readable()
					mockReadStream.push(null)
					return mockReadStream
				}),
				close: jest.fn().mockResolvedValue(undefined),
			})
		}),
	}
})

class TestMediaStreamImageRESTController extends MediaStreamImageRESTController {
	public static testAddHeadersToRequest(res: Response, headers: ResourceMetaData): Response {
		return super.addHeadersToRequest(res, headers)
	}
}

describe('mediaStreamImageRESTController', () => {
	let controller: MediaStreamImageRESTController
	let mockHttpService: jest.Mocked<HttpService>
	let mockGenerateResourceIdentityFromRequestJob: jest.Mocked<GenerateResourceIdentityFromRequestJob>
	let mockCacheImageResourceOperation: jest.Mocked<CacheImageResourceOperation>
	let mockResponse: jest.Mocked<Response>

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
		} as any

		const module: TestingModule = await Test.createTestingModule({
			controllers: [MediaStreamImageRESTController],
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
			],
		}).compile()

		controller = await module.resolve<MediaStreamImageRESTController>(MediaStreamImageRESTController)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe('addHeadersToRequest', () => {
		it('should add headers to response', () => {
			const headers: ResourceMetaData = {
				size: '1000',
				format: 'webp',
				publicTTL: 3600000,
				version: 1,
				dateCreated: Date.now(),
				privateTTL: 0,
			}

			TestMediaStreamImageRESTController.testAddHeadersToRequest(mockResponse, headers)

			expect(mockResponse.header).toHaveBeenCalledWith('Content-Length', '1000')
			expect(mockResponse.header).toHaveBeenCalledWith('Cache-Control', 'max-age=3600, public')
			expect(mockResponse.header).toHaveBeenCalledWith('Content-Type', 'image/webp')
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

			TestMediaStreamImageRESTController.testAddHeadersToRequest(mockResponse, headers)

			expect(mockResponse.header).toHaveBeenCalledWith('Content-Type', 'image/svg+xml')
		})

		it('should throw error if headers are undefined', () => {
			expect(() => {
				TestMediaStreamImageRESTController.testAddHeadersToRequest(mockResponse, undefined)
			}).toThrow('Headers object is undefined')
		})
	})

	describe('uploadedImage', () => {
		it('should handle successful image request', async () => {
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
				value: headers,
			})

			Object.defineProperty(mockCacheImageResourceOperation, 'getResourcePath', {
				value: '/path/to/image.webp',
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

			expect(mockCacheImageResourceOperation.setup).toHaveBeenCalled()
			expect(mockCacheImageResourceOperation.execute).toHaveBeenCalled()
			expect(mockResponse.header).toHaveBeenCalledWith('Content-Length', '1000')
			expect(mockResponse.header).toHaveBeenCalledWith('Cache-Control', 'max-age=3600, public')
			expect(mockResponse.header).toHaveBeenCalledWith('Content-Type', 'image/webp')
			expect(fs.open).toHaveBeenCalledWith('/path/to/image.webp', 'r')
		})

		it('should handle resource not found', async () => {
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
		})
	})

	describe('staticImage', () => {
		it('should handle successful static image request', async () => {
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
				value: headers,
			})

			Object.defineProperty(mockCacheImageResourceOperation, 'getResourcePath', {
				value: '/path/to/image.webp',
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

			expect(mockCacheImageResourceOperation.setup).toHaveBeenCalled()
			expect(mockCacheImageResourceOperation.execute).toHaveBeenCalled()
			expect(mockResponse.header).toHaveBeenCalledWith('Content-Length', '1000')
			expect(mockResponse.header).toHaveBeenCalledWith('Cache-Control', 'max-age=3600, public')
			expect(mockResponse.header).toHaveBeenCalledWith('Content-Type', 'image/webp')
			expect(fs.open).toHaveBeenCalledWith('/path/to/image.webp', 'r')
		})
	})
})
