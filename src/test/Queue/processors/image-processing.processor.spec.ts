import type { Job } from '#microservice/Queue/interfaces/job-queue.interface'
import type { ImageProcessingJobData } from '#microservice/Queue/types/job.types'
import type { MockedObject } from 'vitest'
import { Buffer } from 'node:buffer'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import { HttpClientService } from '#microservice/HTTP/services/http-client.service'
import ManipulationJobResult from '#microservice/Queue/dto/manipulation-job-result.dto'
import WebpImageManipulationJob from '#microservice/Queue/jobs/webp-image-manipulation.job'
import { ImageProcessingProcessor } from '#microservice/Queue/processors/image-processing.processor'
import { JobPriority } from '#microservice/Queue/types/job.types'
import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('imageProcessingProcessor', () => {
	let processor: ImageProcessingProcessor
	let mockCacheManager: MockedObject<MultiLayerCacheManager>
	let mockHttpClient: MockedObject<HttpClientService>
	let mockImageManipulationJob: MockedObject<WebpImageManipulationJob>

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
			head: vi.fn().mockResolvedValue({
				headers: { 'content-length': '1000' },
				status: 200,
			}),
		}

		const mockConfigServiceFactory = {
			get: vi.fn().mockImplementation((key: string) => {
				const configs: Record<string, any> = {
					'cache.image.publicTtl': 12 * 30 * 24 * 3600,
					'cache.image.privateTtl': 6 * 30 * 24 * 3600,
				}
				return configs[key]
			}),
			getOptional: vi.fn().mockImplementation((key: string, defaultValue: any) => {
				const configs: Record<string, any> = {
					'cache.image.publicTtl': 12 * 30 * 24 * 3600,
					'cache.image.privateTtl': 6 * 30 * 24 * 3600,
				}
				return configs[key] ?? defaultValue
			}),
		}

		const mockImageManipulationJobFactory = {
			handle: vi.fn(),
			handleBuffer: vi.fn(),
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
				{
					provide: ConfigService,
					useValue: mockConfigServiceFactory,
				},
				{
					provide: WebpImageManipulationJob,
					useValue: mockImageManipulationJobFactory,
				},
			],
		}).compile()

		processor = module.get<ImageProcessingProcessor>(ImageProcessingProcessor)
		mockCacheManager = module.get(MultiLayerCacheManager)
		mockHttpClient = module.get(HttpClientService)
		mockImageManipulationJob = module.get(WebpImageManipulationJob)

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
			// Production code returns cacheKey reference, not the raw data buffer,
			// to avoid double-serialising the image through Redis.
			expect(result.cacheKey).toBe('image:test-cache-key')
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

			mockCacheManager.get.mockResolvedValue(null)
			mockCacheManager.set.mockResolvedValue(undefined)

			const originalImageData = Buffer.from('original-image-data')
			mockHttpClient.get.mockResolvedValue({
				data: originalImageData,
				status: 200,
				statusText: 'OK',
				headers: { 'content-type': 'image/jpeg' },
				config: {},
			} as any)

			const processedImageData = Buffer.from('processed-image-data')
			mockImageManipulationJob.handleBuffer.mockResolvedValue(
				new ManipulationJobResult({
					size: String(processedImageData.length),
					format: 'webp',
					buffer: processedImageData,
				}),
			)

			const result = await processor.process(job)

			expect(result.success).toBe(true)
			// Production code returns cacheKey reference, not the raw buffer
			expect(result.cacheKey).toBe('image:test-cache-key')
			expect(result.cacheHit).toBeUndefined()
			expect(result.processingTime).toBeGreaterThanOrEqual(0)

			expect(mockHttpClient.get).toHaveBeenCalledWith('https://example.com/image.jpg', {
				responseType: 'arraybuffer',
				timeout: 30000,
				maxContentLength: 10485760,
				maxBodyLength: 10485760,
			})
			expect(mockImageManipulationJob.handleBuffer).toHaveBeenCalledWith(
				expect.any(Buffer),
				expect.objectContaining({
					width: 300,
					height: 200,
					quality: 80,
					format: 'webp',
				}),
			)
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
				headers: { 'content-type': 'image/jpeg' },
				config: {},
			} as any)

			const processedImageData = Buffer.from('processed-jpeg-data')
			mockImageManipulationJob.handleBuffer.mockResolvedValue(
				new ManipulationJobResult({
					size: String(processedImageData.length),
					format: 'jpeg',
					buffer: processedImageData,
				}),
			)

			const result = await processor.process(job)

			expect(result.success).toBe(true)
			expect(mockImageManipulationJob.handleBuffer).toHaveBeenCalledWith(
				expect.any(Buffer),
				expect.objectContaining({ format: 'jpeg', quality: 90 }),
			)
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
				headers: { 'content-type': 'image/webp' },
				config: {},
			} as any)

			const processedImageData = Buffer.from('processed-image-data')
			mockImageManipulationJob.handleBuffer.mockResolvedValue(
				new ManipulationJobResult({
					size: String(processedImageData.length),
					format: 'webp',
					buffer: processedImageData,
				}),
			)

			const result = await processor.process(job)

			expect(result.success).toBe(true)
			expect(mockImageManipulationJob.handleBuffer).toHaveBeenCalled()
		})

		it('should handle HTTP download errors', async () => {
			const job = createMockJob({
				imageUrl: 'https://example.com/nonexistent.jpg',
			})

			mockCacheManager.get.mockResolvedValue(null)
			mockHttpClient.get.mockRejectedValue(new Error('Network error'))

			// Production code lets errors bubble up to Bull's retry machinery
			// rather than swallowing them into { success: false } (which would
			// mark the job as succeeded and skip configured retry attempts).
			await expect(processor.process(job)).rejects.toThrow('Failed to download image: Network error')
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
				headers: { 'content-type': 'image/jpeg' },
				config: {},
			} as any)

			mockImageManipulationJob.handleBuffer.mockRejectedValue(new Error('Invalid image format'))

			// Production code lets errors bubble up to Bull's retry machinery
			await expect(processor.process(job)).rejects.toThrow('Invalid image format')
		})

		it('should handle cache errors gracefully', async () => {
			const job = createMockJob({})

			mockCacheManager.get.mockRejectedValue(new Error('Cache connection error'))

			// Production code lets errors bubble up to Bull's retry machinery
			await expect(processor.process(job)).rejects.toThrow('Cache connection error')
		})

		it('should handle cache set errors but still return error', async () => {
			const job = createMockJob({})

			mockCacheManager.get.mockResolvedValue(null)
			mockCacheManager.set.mockRejectedValue(new Error('Cache write error'))

			const originalImageData = Buffer.from('original-image-data')
			mockHttpClient.get.mockResolvedValue({
				data: originalImageData,
				status: 200,
				statusText: 'OK',
				headers: { 'content-type': 'image/jpeg' },
				config: {},
			} as any)

			const processedImageData = Buffer.from('processed-image-data')
			mockImageManipulationJob.handleBuffer.mockResolvedValue(
				new ManipulationJobResult({
					size: String(processedImageData.length),
					format: 'webp',
					buffer: processedImageData,
				}),
			)

			// Production code lets errors bubble up to Bull's retry machinery
			await expect(processor.process(job)).rejects.toThrow('Cache write error')
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
