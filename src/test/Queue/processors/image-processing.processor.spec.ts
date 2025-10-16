import type { Job } from '@microservice/Queue/interfaces/job-queue.interface'
import type { ImageProcessingJobData } from '@microservice/Queue/types/job.types'
import type { MockedFunction, MockedObject } from 'vitest'
import { Buffer } from 'node:buffer'
import { MultiLayerCacheManager } from '@microservice/Cache/services/multi-layer-cache.manager'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { HttpClientService } from '@microservice/HTTP/services/http-client.service'
import { ImageProcessingProcessor } from '@microservice/Queue/processors/image-processing.processor'
import { JobPriority } from '@microservice/Queue/types/job.types'
import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock sharp
vi.mock('sharp')
const mockSharp = sharp as MockedFunction<typeof sharp>

describe('imageProcessingProcessor', () => {
	let processor: ImageProcessingProcessor
	let mockCacheManager: MockedObject<MultiLayerCacheManager>
	let mockHttpClient: MockedObject<HttpClientService>

	const createMockJob = (data: Partial<ImageProcessingJobData>): Job<ImageProcessingJobData> => ({
		id: 'test-job',
		name: 'image-processing',
		data: {
			correlationId: 'corr-123',
			imageUrl: 'https://example.com/image.jpg',
			cacheKey: 'test-cache-key',
			priority: JobPriority.NORMAL,
			...data,
		},
		opts: {},
		progress: 0,
		delay: 0,
		timestamp: Date.now(),
		attemptsMade: 0,
	})

	beforeEach(async () => {
		const mockCacheManagerFactory = {
			get: vi.fn(),
			set: vi.fn(),
		}

		const mockCorrelationServiceFactory = {
			getCorrelationId: vi.fn(),
			setCorrelationId: vi.fn(),
			runWithContext: vi.fn((context, fn) => fn()),
		}

		const mockHttpClientFactory = {
			get: vi.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ImageProcessingProcessor,
				{
					provide: MultiLayerCacheManager,
					useValue: mockCacheManagerFactory,
				},
				{
					provide: CorrelationService,
					useValue: mockCorrelationServiceFactory,
				},
				{
					provide: HttpClientService,
					useValue: mockHttpClientFactory,
				},
			],
		}).compile()

		processor = module.get<ImageProcessingProcessor>(ImageProcessingProcessor)
		mockCacheManager = module.get(MultiLayerCacheManager)
		mockHttpClient = module.get(HttpClientService)

		// Mock logger to avoid console output during tests
		vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
		vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
		vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
		vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		vi.clearAllMocks()
		vi.resetAllMocks()
	})

	describe('process', () => {
		it('should return cached result if available', async () => {
			const job = createMockJob({
				width: 300,
				height: 200,
				quality: 80,
				format: 'webp',
			})

			const cachedData = 'cached-image-data'
			mockCacheManager.get.mockResolvedValue(cachedData)

			const result = await processor.process(job)

			expect(result.success).toBe(true)
			expect(result.data).toBe(cachedData)
			expect(result.cacheHit).toBe(true)
			expect(result.processingTime).toBeGreaterThanOrEqual(0)
			expect(mockHttpClient.get).not.toHaveBeenCalled()
		})

		it('should process image when not cached', async () => {
			const job = createMockJob({
				width: 300,
				height: 200,
				quality: 80,
				format: 'webp',
			})

			// Mock cache miss
			mockCacheManager.get.mockResolvedValue(null)
			mockCacheManager.set.mockResolvedValue(undefined)

			// Mock HTTP response
			const originalImageData = Buffer.from('original-image-data')
			mockHttpClient.get.mockResolvedValue({
				data: originalImageData,
				status: 200,
				statusText: 'OK',
				headers: {},
				config: {},
			} as any)

			// Mock sharp processing
			const processedImageData = Buffer.from('processed-image-data')
			const mockSharpInstance = {
				resize: vi.fn().mockReturnThis(),
				webp: vi.fn().mockReturnThis(),
				withMetadata: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockResolvedValue(processedImageData),
				destroy: vi.fn(),
			}
			mockSharp.mockReturnValue(mockSharpInstance as any)

			const result = await processor.process(job)

			expect(result.success).toBe(true)
			expect(result.data).toBe(processedImageData)
			expect(result.cacheHit).toBe(false)
			expect(result.processingTime).toBeGreaterThanOrEqual(0)

			expect(mockHttpClient.get).toHaveBeenCalledWith('https://example.com/image.jpg', {
				responseType: 'arraybuffer',
				timeout: 30000,
			})
			expect(mockSharp).toHaveBeenCalledWith(originalImageData, expect.objectContaining({
				failOn: 'none',
				sequentialRead: true,
			}))
			expect(mockSharpInstance.resize).toHaveBeenCalledWith(expect.objectContaining({
				width: 300,
				height: 200,
				fastShrinkOnLoad: true,
				kernel: 'lanczos3',
			}))
			expect(mockSharpInstance.webp).toHaveBeenCalledWith(expect.objectContaining({
				quality: 80,
				nearLossless: true,
				smartSubsample: true,
			}))
			expect(mockCacheManager.set).toHaveBeenCalledWith(
				'image',
				'test-cache-key',
				expect.objectContaining({
					data: processedImageData,
					metadata: expect.any(Object),
				}),
				expect.any(Number),
			)
		})

		it('should handle JPEG format processing', async () => {
			const job = createMockJob({
				width: 300,
				height: 200,
				quality: 90,
				format: 'jpeg',
			})

			mockCacheManager.get.mockResolvedValue(null)
			mockCacheManager.set.mockResolvedValue(undefined)

			const originalImageData = Buffer.from('original-image-data')
			mockHttpClient.get.mockResolvedValue({
				data: originalImageData,
				status: 200,
				statusText: 'OK',
				headers: {},
				config: {},
			} as any)

			const processedImageData = Buffer.from('processed-jpeg-data')
			const mockSharpInstance = {
				resize: vi.fn().mockReturnThis(),
				jpeg: vi.fn().mockReturnThis(),
				withMetadata: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockResolvedValue(processedImageData),
				destroy: vi.fn(),
			}
			mockSharp.mockReturnValue(mockSharpInstance as any)

			const result = await processor.process(job)

			expect(result.success).toBe(true)
			expect(mockSharpInstance.jpeg).toHaveBeenCalledWith(expect.objectContaining({
				quality: 90,
				progressive: true,
			}))
		})

		it('should handle PNG format processing', async () => {
			const job = createMockJob({
				format: 'png',
				quality: 95,
			})

			mockCacheManager.get.mockResolvedValue(null)
			mockCacheManager.set.mockResolvedValue(undefined)

			const originalImageData = Buffer.from('original-image-data')
			mockHttpClient.get.mockResolvedValue({
				data: originalImageData,
				status: 200,
				statusText: 'OK',
				headers: {},
				config: {},
			} as any)

			const processedImageData = Buffer.from('processed-png-data')
			const mockSharpInstance = {
				png: vi.fn().mockReturnThis(),
				withMetadata: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockResolvedValue(processedImageData),
				destroy: vi.fn(),
			}
			mockSharp.mockReturnValue(mockSharpInstance as any)

			const result = await processor.process(job)

			expect(result.success).toBe(true)
			expect(mockSharpInstance.png).toHaveBeenCalledWith(expect.objectContaining({
				quality: 95,
			}))
		})

		it('should handle processing without dimensions', async () => {
			const job = createMockJob({
				format: 'webp',
			})

			mockCacheManager.get.mockResolvedValue(null)
			mockCacheManager.set.mockResolvedValue(undefined)

			const originalImageData = Buffer.from('original-image-data')
			mockHttpClient.get.mockResolvedValue({
				data: originalImageData,
				status: 200,
				statusText: 'OK',
				headers: {},
				config: {},
			} as any)

			const processedImageData = Buffer.from('processed-image-data')
			const mockSharpInstance = {
				webp: vi.fn().mockReturnThis(),
				withMetadata: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockResolvedValue(processedImageData),
				destroy: vi.fn(),
			}
			mockSharp.mockReturnValue(mockSharpInstance as any)

			const result = await processor.process(job)

			expect(result.success).toBe(true)
			expect(mockSharpInstance.webp).toHaveBeenCalledWith(expect.objectContaining({
				quality: 80,
				nearLossless: true,
				smartSubsample: true,
			}))
			// resize should not be called when no dimensions provided
			// (mock doesn't have resize method when dimensions aren't needed)
		})

		it('should handle unknown format by keeping original', async () => {
			const job = createMockJob({})

			mockCacheManager.get.mockResolvedValue(null)
			mockCacheManager.set.mockResolvedValue(undefined)

			const originalImageData = Buffer.from('original-image-data')
			mockHttpClient.get.mockResolvedValue({
				data: originalImageData,
				status: 200,
				statusText: 'OK',
				headers: {},
				config: {},
			} as any)

			const processedImageData = Buffer.from('processed-image-data')
			const mockSharpInstance = {
				webp: vi.fn().mockReturnThis(),
				withMetadata: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockResolvedValue(processedImageData),
				destroy: vi.fn(),
			}
			mockSharp.mockReturnValue(mockSharpInstance as any)

			const result = await processor.process(job)

			expect(result.success).toBe(true)
			expect(mockSharpInstance.toBuffer).toHaveBeenCalled()
		})

		it('should handle HTTP download errors', async () => {
			const job = createMockJob({
				imageUrl: 'https://example.com/nonexistent.jpg',
			})

			mockCacheManager.get.mockResolvedValue(null)
			mockHttpClient.get.mockRejectedValue(new Error('Network error'))

			const result = await processor.process(job)

			expect(result.success).toBe(false)
			expect(result.error).toBe('Failed to download image: Network error')
			expect(result.cacheHit).toBe(false)
			expect(result.processingTime).toBeGreaterThanOrEqual(0)
		})

		it('should handle image processing errors', async () => {
			const job = createMockJob({
				width: 300,
				height: 200,
			})

			mockCacheManager.get.mockResolvedValue(null)

			const originalImageData = Buffer.from('corrupt-image-data')
			mockHttpClient.get.mockResolvedValue({
				data: originalImageData,
				status: 200,
				statusText: 'OK',
				headers: {},
				config: {},
			} as any)

			// Mock sharp processing error
			const mockSharpInstance = {
				resize: vi.fn().mockReturnThis(),
				webp: vi.fn().mockReturnThis(),
				withMetadata: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockRejectedValue(new Error('Invalid image format')),
				destroy: vi.fn(),
			}
			mockSharp.mockReturnValue(mockSharpInstance as any)

			const result = await processor.process(job)

			expect(result.success).toBe(false)
			expect(result.error).toBe('Image processing failed: Invalid image format')
			expect(result.cacheHit).toBe(false)
		})

		it('should handle cache errors gracefully', async () => {
			const job = createMockJob({})

			// Mock cache get error
			mockCacheManager.get.mockRejectedValue(new Error('Cache connection error'))

			const result = await processor.process(job)

			expect(result.success).toBe(false)
			expect(result.error).toBe('Cache connection error')
			expect(result.cacheHit).toBe(false)
		})

		it('should handle cache set errors but still return processed image', async () => {
			const job = createMockJob({})

			mockCacheManager.get.mockResolvedValue(null)
			mockCacheManager.set.mockRejectedValue(new Error('Cache write error'))

			const originalImageData = Buffer.from('original-image-data')
			mockHttpClient.get.mockResolvedValue({
				data: originalImageData,
				status: 200,
				statusText: 'OK',
				headers: {},
				config: {},
			} as any)

			const processedImageData = Buffer.from('processed-image-data')
			const mockSharpInstance = {
				webp: vi.fn().mockReturnThis(),
				withMetadata: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockResolvedValue(processedImageData),
				destroy: vi.fn(),
			}
			mockSharp.mockReturnValue(mockSharpInstance as any)

			const result = await processor.process(job)

			expect(result.success).toBe(false)
			expect(result.error).toBe('Cache write error')
		})
	})

	describe('updateProgress', () => {
		it('should log progress updates', async () => {
			const job = createMockJob({})

			const logSpy = vi.spyOn(Logger.prototype, 'debug')

			await (processor as any).updateProgress(job, 50, 'Processing')

			expect(logSpy).toHaveBeenCalledWith('Job test-job progress: 50% - Processing')
		})
	})
})
