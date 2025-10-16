import type { AxiosResponse } from 'axios'
import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	ResizeOptions,
	SupportedResizeFormats,
} from '@microservice/API/dto/cache-image-request.dto'
import CacheImageResourceOperation from '@microservice/Cache/operations/cache-image-resource.operation'
import { MultiLayerCacheManager } from '@microservice/Cache/services/multi-layer-cache.manager'
import ResourceMetaData from '@microservice/HTTP/dto/resource-meta-data.dto'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import ManipulationJobResult from '@microservice/Queue/dto/manipulation-job-result.dto'
import FetchResourceResponseJob from '@microservice/Queue/jobs/fetch-resource-response.job'
import GenerateResourceIdentityFromRequestJob from '@microservice/Queue/jobs/generate-resource-identity-from-request.job'
import StoreResourceResponseToFileJob from '@microservice/Queue/jobs/store-resource-response-to-file.job'
import WebpImageManipulationJob from '@microservice/Queue/jobs/webp-image-manipulation.job'
import { JobQueueManager } from '@microservice/Queue/services/job-queue.manager'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Validation/rules/validate-cache-image-request-resize-target.rule'
import ValidateCacheImageRequestRule from '@microservice/Validation/rules/validate-cache-image-request.rule'
import { InputSanitizationService } from '@microservice/Validation/services/input-sanitization.service'
import { HttpService } from '@nestjs/axios'
import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises')
vi.mock('node:process', () => ({
	cwd: vi.fn(() => '/mock/cwd'),
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
			handle: vi.fn(),
		} as unknown as GenerateResourceIdentityFromRequestJob
		vi.spyOn(mockGenerateResourceIdentityFromRequestJob, 'handle').mockResolvedValue('mock-resource-id')

		mockFetchResourceResponseJob = {
			handle: vi.fn(),
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

		vi.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValue(mockResponse)

		mockStoreResourceResponseToFileJob = {
			handle: vi.fn(),
		} as unknown as StoreResourceResponseToFileJob
		vi.spyOn(mockStoreResourceResponseToFileJob, 'handle').mockResolvedValue()

		mockWebpImageManipulationJob = {
			handle: vi.fn(),
		} as unknown as WebpImageManipulationJob
		vi.spyOn(mockWebpImageManipulationJob, 'handle').mockResolvedValue({
			format: 'webp',
			size: '1000',
		} as ManipulationJobResult)

		mockValidateCacheImageRequestRule = {
			setup: vi.fn(),
			apply: vi.fn(),
		} as unknown as ValidateCacheImageRequestRule

		mockValidateCacheImageRequestResizeTargetRule = {
			setup: vi.fn(),
			apply: vi.fn(),
		} as unknown as ValidateCacheImageRequestResizeTargetRule

		mockCacheManager = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			exists: vi.fn(),
		} as unknown as MultiLayerCacheManager

		mockInputSanitizationService = {
			sanitize: vi.fn(),
			validateUrl: vi.fn(),
			validateFileSize: vi.fn(),
			validateImageDimensions: vi.fn(),
		} as unknown as InputSanitizationService

		mockJobQueueManager = {
			addImageProcessingJob: vi.fn(),
		} as unknown as JobQueueManager

		mockMetricsService = {
			recordCacheOperation: vi.fn(),
			recordImageProcessing: vi.fn(),
			recordError: vi.fn(),
		} as unknown as MetricsService

		mockLogger = {
			log: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
			verbose: vi.fn(),
		} as unknown as Logger

		// Setup default mock behaviors
		vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
		vi.spyOn(mockCacheManager, 'set').mockResolvedValue()
		vi.spyOn(mockCacheManager, 'delete').mockResolvedValue()
		vi.spyOn(mockCacheManager, 'exists').mockResolvedValue(false)

		vi.spyOn(mockInputSanitizationService, 'sanitize').mockImplementation(async input => input)
		vi.spyOn(mockInputSanitizationService, 'validateUrl').mockReturnValue(true)
		vi.spyOn(mockInputSanitizationService, 'validateFileSize').mockReturnValue(true)
		vi.spyOn(mockInputSanitizationService, 'validateImageDimensions').mockReturnValue(true)

		vi.spyOn(mockJobQueueManager, 'addImageProcessingJob').mockResolvedValue({} as any)

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
			vi.spyOn(mockInputSanitizationService, 'validateUrl').mockReturnValue(false)

			await expect(operation.setup(mockRequest)).rejects.toThrow('Invalid or disallowed URL')
			expect(mockMetricsService.recordError).toHaveBeenCalledWith('validation', 'setup')
		})

		it('should throw error for invalid dimensions', async () => {
			vi.spyOn(mockInputSanitizationService, 'validateImageDimensions').mockReturnValue(false)

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

			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(mockCachedResource)

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

			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(expiredResource)
			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockResolvedValue()

			await operation.resourceExists
			expect(mockCacheManager.delete).toHaveBeenCalledWith('image', operation.id)
		})

		it('should fallback to filesystem when cache miss', async () => {
			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = vi.mocked(fs)
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

			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(mockCachedResource)

			await operation.execute()

			expect(mockFetchResourceResponseJob.handle).not.toHaveBeenCalled()
			expect(mockMetricsService.recordImageProcessing).toHaveBeenCalledWith('cache_check', 'cached', 'success', expect.any(Number))
		})

		it('should queue large image processing in background', async () => {
			// Set up large image dimensions (> 2MP threshold)
			mockRequest.resizeOptions.width = 2000
			mockRequest.resizeOptions.height = 1500 // 3MP total
			await operation.setup(mockRequest)

			// Mock shouldUseBackgroundProcessing to return true for this test
			vi.spyOn(operation, 'shouldUseBackgroundProcessing').mockReturnValue(true)

			// Ensure cache returns null so resource doesn't exist
			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)

			// Mock filesystem access to return false (resource doesn't exist)
			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockRejectedValue(new Error('File not found'))

			await operation.execute()

			expect(mockJobQueueManager.addImageProcessingJob).toHaveBeenCalledWith({
				imageUrl: mockRequest.resourceTarget,
				width: mockRequest.resizeOptions.width,
				height: mockRequest.resizeOptions.height,
				quality: mockRequest.resizeOptions.quality,
				format: mockRequest.resizeOptions.format,
				fit: mockRequest.resizeOptions.fit,
				position: mockRequest.resizeOptions.position,
				background: mockRequest.resizeOptions.background,
				trimThreshold: mockRequest.resizeOptions.trimThreshold,
				cacheKey: operation.id,
				priority: expect.any(Number),
			})
		})

		it('should process small images synchronously', async () => {
			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = vi.mocked(fs)
			mockedFs.readFile.mockResolvedValue(Buffer.from('processed-image-data'))

			await operation.execute()

			expect(mockFetchResourceResponseJob.handle).toHaveBeenCalled()
			expect(mockWebpImageManipulationJob.handle).toHaveBeenCalled()
			expect(mockCacheManager.set).toHaveBeenCalledWith('image', operation.id, expect.any(Object), expect.any(Number))
		})

		it('should validate file size during processing', async () => {
			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			vi.spyOn(mockInputSanitizationService, 'validateFileSize').mockReturnValue(false)

			const mockResponse = {
				status: 200,
				statusText: 'OK',
				headers: { 'content-length': '50000000' }, // 50MB
				data: Buffer.from('large-image-data'),
				config: {} as any,
			} as AxiosResponse

			vi.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValue(mockResponse)

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

			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(mockCachedResource)

			const result = await operation.getCachedResource()

			expect(result).toEqual(mockCachedResource)
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'hit', expect.any(Number))
		})

		it('should fallback to filesystem and cache result', async () => {
			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = vi.mocked(fs)
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
			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockRejectedValue(new Error('File not found'))

			const result = await operation.getCachedResource()

			expect(result).toBeNull()
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'miss', expect.any(Number))
		})

		it('should handle errors gracefully', async () => {
			vi.spyOn(mockCacheManager, 'get').mockRejectedValue(new Error('Cache error'))

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

			const mockedFs = vi.mocked(fs)
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
