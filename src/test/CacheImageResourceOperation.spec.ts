import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	ResizeOptions,
	SupportedResizeFormats,
} from '@microservice/API/DTO/CacheImageRequest'
import { MultiLayerCacheManager } from '@microservice/Cache/services/multi-layer-cache.manager'
import ManipulationJobResult from '@microservice/DTO/ManipulationJobResult'
import ResourceMetaData from '@microservice/DTO/ResourceMetaData'
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob'
import WebpImageManipulationJob from '@microservice/Job/WebpImageManipulationJob'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import { JobQueueManager } from '@microservice/Queue/services/job-queue.manager'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Rule/ValidateCacheImageRequestResizeTargetRule'
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule'
import { InputSanitizationService } from '@microservice/Validation/services/input-sanitization.service'
import { HttpService } from '@nestjs/axios'
import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AxiosHeaders, AxiosResponse } from 'axios'

jest.mock('node:fs/promises')
jest.mock('node:process', () => ({
	cwd: jest.fn(() => '/mock/cwd'),
}))

describe('cacheImageResourceOperation', () => {
	let operation: CacheImageResourceOperation
	let mockHttpService: HttpService
	let mockGenerateResourceIdentityFromRequestJob: GenerateResourceIdentityFromRequestJob
	let mockFetchResourceResponseJob: FetchResourceResponseJob
	let mockStoreResourceResponseToFileJob: StoreResourceResponseToFileJob
	let mockWebpImageManipulationJob: WebpImageManipulationJob
	let mockValidateCacheImageRequestRule: ValidateCacheImageRequestRule
	let mockValidateCacheImageRequestResizeTargetRule: ValidateCacheImageRequestResizeTargetRule
	let mockCacheManager: MultiLayerCacheManager
	let mockInputSanitizationService: InputSanitizationService
	let mockJobQueueManager: JobQueueManager
	let mockMetricsService: MetricsService
	let mockLogger: Logger
	let mockCwd: string
	let mockRequest: CacheImageRequest
	let moduleRef: any

	beforeEach(async () => {
		mockCwd = '/mock/cwd'
		mockRequest = new CacheImageRequest()
		mockRequest.resourceTarget = 'https://example.com/image.jpg'
		mockRequest.resizeOptions = new ResizeOptions()
		mockRequest.resizeOptions.width = 100
		mockRequest.resizeOptions.height = 100
		mockRequest.resizeOptions.quality = 80
		mockRequest.resizeOptions.format = SupportedResizeFormats.webp
		mockRequest.resizeOptions.fit = FitOptions.contain
		mockRequest.resizeOptions.position = PositionOptions.entropy
		mockRequest.resizeOptions.background = BackgroundOptions.white
		mockRequest.resizeOptions.trimThreshold = 10

		mockHttpService = {} as HttpService

		mockGenerateResourceIdentityFromRequestJob = {
			handle: jest.fn(),
		} as unknown as GenerateResourceIdentityFromRequestJob
		jest.spyOn(mockGenerateResourceIdentityFromRequestJob, 'handle').mockResolvedValue('mock-resource-id')

		mockFetchResourceResponseJob = {
			handle: jest.fn(),
		} as unknown as FetchResourceResponseJob

		const axiosHeaders = new AxiosHeaders()
		axiosHeaders.set('content-type', 'image/jpeg')

		const mockResponse = {
			status: 200,
			statusText: 'OK',
			headers: { 'content-type': 'image/jpeg' },
			data: Buffer.from('mock-image-data'),
			config: {
				headers: axiosHeaders,
				url: 'https://example.com/image.jpg',
				method: 'GET',
			},
		} as unknown as AxiosResponse

		jest.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValue(mockResponse)

		mockStoreResourceResponseToFileJob = {
			handle: jest.fn(),
		} as unknown as StoreResourceResponseToFileJob
		jest.spyOn(mockStoreResourceResponseToFileJob, 'handle').mockResolvedValue()

		mockWebpImageManipulationJob = {
			handle: jest.fn(),
		} as unknown as WebpImageManipulationJob
		jest.spyOn(mockWebpImageManipulationJob, 'handle').mockResolvedValue({
			format: 'webp',
			size: '1000',
		} as ManipulationJobResult)

		mockValidateCacheImageRequestRule = {
			setup: jest.fn(),
			apply: jest.fn(),
		} as unknown as ValidateCacheImageRequestRule

		mockValidateCacheImageRequestResizeTargetRule = {
			setup: jest.fn(),
			apply: jest.fn(),
		} as unknown as ValidateCacheImageRequestResizeTargetRule

		mockCacheManager = {
			get: jest.fn(),
			set: jest.fn(),
			delete: jest.fn(),
			exists: jest.fn(),
		} as unknown as MultiLayerCacheManager

		mockInputSanitizationService = {
			sanitize: jest.fn(),
			validateUrl: jest.fn(),
			validateFileSize: jest.fn(),
			validateImageDimensions: jest.fn(),
		} as unknown as InputSanitizationService

		mockJobQueueManager = {
			addImageProcessingJob: jest.fn(),
		} as unknown as JobQueueManager

		mockMetricsService = {
			recordCacheOperation: jest.fn(),
			recordImageProcessing: jest.fn(),
			recordError: jest.fn(),
		} as unknown as MetricsService

		mockLogger = {
			log: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
			verbose: jest.fn(),
		} as unknown as Logger

		// Setup default mock behaviors
		jest.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
		jest.spyOn(mockCacheManager, 'set').mockResolvedValue()
		jest.spyOn(mockCacheManager, 'delete').mockResolvedValue()
		jest.spyOn(mockCacheManager, 'exists').mockResolvedValue(false)

		jest.spyOn(mockInputSanitizationService, 'sanitize').mockImplementation(async input => input)
		jest.spyOn(mockInputSanitizationService, 'validateUrl').mockReturnValue(true)
		jest.spyOn(mockInputSanitizationService, 'validateFileSize').mockReturnValue(true)
		jest.spyOn(mockInputSanitizationService, 'validateImageDimensions').mockReturnValue(true)

		jest.spyOn(mockJobQueueManager, 'addImageProcessingJob').mockResolvedValue({} as any)

		moduleRef = await Test.createTestingModule({
			providers: [
				CacheImageResourceOperation,
				{ provide: HttpService, useValue: mockHttpService },
				{ provide: GenerateResourceIdentityFromRequestJob, useValue: mockGenerateResourceIdentityFromRequestJob },
				{ provide: FetchResourceResponseJob, useValue: mockFetchResourceResponseJob },
				{ provide: StoreResourceResponseToFileJob, useValue: mockStoreResourceResponseToFileJob },
				{ provide: WebpImageManipulationJob, useValue: mockWebpImageManipulationJob },
				{ provide: ValidateCacheImageRequestRule, useValue: mockValidateCacheImageRequestRule },
				{ provide: ValidateCacheImageRequestResizeTargetRule, useValue: mockValidateCacheImageRequestResizeTargetRule },
				{ provide: MultiLayerCacheManager, useValue: mockCacheManager },
				{ provide: InputSanitizationService, useValue: mockInputSanitizationService },
				{ provide: JobQueueManager, useValue: mockJobQueueManager },
				{ provide: MetricsService, useValue: mockMetricsService },
				{ provide: Logger, useValue: mockLogger },
			],
		}).compile()

		operation = await moduleRef.resolve(CacheImageResourceOperation)
	})

	describe('resource Path Getters', () => {
		beforeEach(async () => {
			operation.id = 'test-resource'
			await operation.setup(mockRequest)
		})

		it('should return correct resource path', () => {
			const expected = path.normalize(path.join(mockCwd, 'storage', `${operation.id}.rsc`))
			const resourcePath = operation.getResourcePath
			expect(resourcePath).toBe(expected)
		})

		it('should return correct resource temp path', () => {
			const expected = path.normalize(path.join(mockCwd, 'storage', `${operation.id}.rst`))
			const resourceTempPath = operation.getResourceTempPath
			expect(resourceTempPath).toBe(expected)
		})

		it('should return correct resource meta path', () => {
			const expected = path.normalize(path.join(mockCwd, 'storage', `${operation.id}.rsm`))
			const resourceMetaPath = operation.getResourceMetaPath
			expect(resourceMetaPath).toBe(expected)
		})
	})

	describe('setup with new infrastructure', () => {
		it('should sanitize input and validate URL', async () => {
			await operation.setup(mockRequest)

			expect(mockInputSanitizationService.sanitize).toHaveBeenCalledWith(mockRequest)
			expect(mockInputSanitizationService.validateUrl).toHaveBeenCalledWith(mockRequest.resourceTarget)
			expect(mockInputSanitizationService.validateImageDimensions).toHaveBeenCalledWith(100, 100)
		})

		it('should throw error for invalid URL', async () => {
			jest.spyOn(mockInputSanitizationService, 'validateUrl').mockReturnValue(false)

			await expect(operation.setup(mockRequest)).rejects.toThrow('Invalid or disallowed URL')
			expect(mockMetricsService.recordError).toHaveBeenCalledWith('validation', 'setup')
		})

		it('should throw error for invalid dimensions', async () => {
			jest.spyOn(mockInputSanitizationService, 'validateImageDimensions').mockReturnValue(false)

			await expect(operation.setup(mockRequest)).rejects.toThrow('Invalid image dimensions')
			expect(mockMetricsService.recordError).toHaveBeenCalledWith('validation', 'setup')
		})
	})

	describe('resourceExists with cache integration', () => {
		beforeEach(async () => {
			await operation.setup(mockRequest)
		})

		it('should return true when resource exists in cache and is valid', async () => {
			const mockCachedResource = {
				data: Buffer.from('cached-data'),
				metadata: new ResourceMetaData({
					version: 1,
					size: '1000',
					format: 'webp',
					dateCreated: Date.now(),
					publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
					privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
				}),
			}

			jest.spyOn(mockCacheManager, 'get').mockResolvedValue(mockCachedResource)

			const result = await operation.resourceExists
			expect(result).toBe(true)
			expect(mockCacheManager.get).toHaveBeenCalledWith('image', operation.id)
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'hit', expect.any(Number))
		})

		it('should delete expired resource from cache', async () => {
			const expiredResource = {
				data: Buffer.from('expired-data'),
				metadata: new ResourceMetaData({
					version: 1,
					size: '1000',
					format: 'webp',
					dateCreated: Date.now() - 7 * 30 * 24 * 60 * 60 * 1000, // 7 months ago
					publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
					privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
				}),
			}

			jest.spyOn(mockCacheManager, 'get').mockResolvedValue(expiredResource)
			const mockedFs = jest.mocked(fs)
			mockedFs.access.mockResolvedValue()

			await operation.resourceExists
			expect(mockCacheManager.delete).toHaveBeenCalledWith('image', operation.id)
		})

		it('should fallback to filesystem when cache miss', async () => {
			jest.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = jest.mocked(fs)
			mockedFs.access.mockResolvedValue()
			mockedFs.readFile.mockResolvedValue(JSON.stringify({
				version: 1,
				size: '1000',
				format: 'webp',
				dateCreated: Date.now(),
				publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
				privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
			}))

			const result = await operation.resourceExists
			expect(result).toBe(true)
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'hit', expect.any(Number))
		})
	})

	describe('execute with background processing', () => {
		beforeEach(async () => {
			await operation.setup(mockRequest)
		})

		it('should return early if resource already exists', async () => {
			const mockCachedResource = {
				data: Buffer.from('cached-data'),
				metadata: new ResourceMetaData({
					version: 1,
					size: '1000',
					format: 'webp',
					dateCreated: Date.now(),
					publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
					privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
				}),
			}

			jest.spyOn(mockCacheManager, 'get').mockResolvedValue(mockCachedResource)

			await operation.execute()

			expect(mockFetchResourceResponseJob.handle).not.toHaveBeenCalled()
			expect(mockMetricsService.recordImageProcessing).toHaveBeenCalledWith('cache_check', 'cached', 'success', expect.any(Number))
		})

		it('should queue large image processing in background', async () => {
			// Set up large image dimensions (> 2MP threshold)
			mockRequest.resizeOptions.width = 2000
			mockRequest.resizeOptions.height = 1500 // 3MP total
			await operation.setup(mockRequest)

			// Ensure cache returns null so resource doesn't exist
			jest.spyOn(mockCacheManager, 'get').mockResolvedValue(null)

			// Mock filesystem access to return false (resource doesn't exist)
			const mockedFs = jest.mocked(fs)
			mockedFs.access.mockRejectedValue(new Error('File not found'))

			await operation.execute()

			expect(mockJobQueueManager.addImageProcessingJob).toHaveBeenCalledWith({
				imageUrl: mockRequest.resourceTarget,
				width: mockRequest.resizeOptions.width,
				height: mockRequest.resizeOptions.height,
				quality: mockRequest.resizeOptions.quality,
				format: mockRequest.resizeOptions.format,
				cacheKey: operation.id,
				priority: expect.any(Number),
			})
		})

		it('should process small images synchronously', async () => {
			jest.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = jest.mocked(fs)
			mockedFs.readFile.mockResolvedValue(Buffer.from('processed-image-data'))

			await operation.execute()

			expect(mockFetchResourceResponseJob.handle).toHaveBeenCalled()
			expect(mockWebpImageManipulationJob.handle).toHaveBeenCalled()
			expect(mockCacheManager.set).toHaveBeenCalledWith('image', operation.id, expect.any(Object), expect.any(Number))
		})

		it('should validate file size during processing', async () => {
			jest.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			jest.spyOn(mockInputSanitizationService, 'validateFileSize').mockReturnValue(false)

			const mockResponse = {
				status: 200,
				statusText: 'OK',
				headers: { 'content-length': '50000000' }, // 50MB
				data: Buffer.from('large-image-data'),
				config: {} as any,
			} as AxiosResponse

			jest.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValue(mockResponse)

			await expect(operation.execute()).rejects.toThrow('Error fetching or processing image.')
			expect(mockMetricsService.recordImageProcessing).toHaveBeenCalledWith('execute', 'unknown', 'error', expect.any(Number))
		})
	})

	describe('getCachedResource', () => {
		beforeEach(async () => {
			await operation.setup(mockRequest)
		})

		it('should return cached resource from multi-layer cache', async () => {
			const mockCachedResource = {
				data: Buffer.from('cached-data'),
				metadata: new ResourceMetaData({
					version: 1,
					size: '1000',
					format: 'webp',
					dateCreated: Date.now(),
					publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
					privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
				}),
			}

			jest.spyOn(mockCacheManager, 'get').mockResolvedValue(mockCachedResource)

			const result = await operation.getCachedResource()

			expect(result).toEqual(mockCachedResource)
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'hit', expect.any(Number))
		})

		it('should fallback to filesystem and cache result', async () => {
			jest.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = jest.mocked(fs)
			mockedFs.access.mockResolvedValue()
			mockedFs.readFile
				.mockResolvedValueOnce(Buffer.from('file-data'))
				.mockResolvedValueOnce(JSON.stringify({
					version: 1,
					size: '1000',
					format: 'webp',
					dateCreated: Date.now(),
					publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
					privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
				}))

			const result = await operation.getCachedResource()

			expect(result).toBeDefined()
			expect(result?.data).toEqual(Buffer.from('file-data'))
			expect(mockCacheManager.set).toHaveBeenCalledWith('image', operation.id, expect.any(Object), expect.any(Number))
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'hit', expect.any(Number))
		})

		it('should return null when resource not found', async () => {
			jest.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = jest.mocked(fs)
			mockedFs.access.mockRejectedValue(new Error('File not found'))

			const result = await operation.getCachedResource()

			expect(result).toBeNull()
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'miss', expect.any(Number))
		})

		it('should handle errors gracefully', async () => {
			jest.spyOn(mockCacheManager, 'get').mockRejectedValue(new Error('Cache error'))

			const result = await operation.getCachedResource()

			expect(result).toBeNull()
			expect(mockMetricsService.recordError).toHaveBeenCalledWith('cache_retrieval', 'get_cached_resource')
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'error', expect.any(Number))
		})
	})

	describe('optimizeAndServeDefaultImage', () => {
		it('should optimize and serve default image with custom options', async () => {
			const customOptions = new ResizeOptions()
			customOptions.width = 100
			customOptions.height = 100
			customOptions.fit = FitOptions.contain
			customOptions.position = PositionOptions.entropy
			customOptions.format = SupportedResizeFormats.webp
			customOptions.background = BackgroundOptions.white
			customOptions.trimThreshold = 5
			customOptions.quality = 100

			const mockedFs = jest.mocked(fs)
			mockedFs.access.mockRejectedValueOnce({ code: 'ENOENT' } as NodeJS.ErrnoException)

			const result = await operation.optimizeAndServeDefaultImage(customOptions)
			expect(result).toBeDefined()
			expect(mockWebpImageManipulationJob.handle).toHaveBeenCalledWith(
				path.normalize(path.join(mockCwd, 'public', 'default.png')),
				expect.any(String),
				expect.objectContaining({
					width: 100,
					height: 100,
					fit: FitOptions.contain,
					position: PositionOptions.entropy,
					format: SupportedResizeFormats.webp,
					background: BackgroundOptions.white,
					trimThreshold: 5,
					quality: 100,
				}),
			)
		})
	})
})
