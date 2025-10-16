import type { JobOptions } from '@microservice/Queue/interfaces/job-queue.interface'
import type { MockedObject } from 'vitest'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { CacheOperationsProcessor } from '@microservice/Queue/processors/cache-operations.processor'
import { ImageProcessingProcessor } from '@microservice/Queue/processors/image-processing.processor'
import { BullQueueService } from '@microservice/Queue/services/bull-queue.service'
import { JobQueueManager } from '@microservice/Queue/services/job-queue.manager'
import { JobPriority, JobType } from '@microservice/Queue/types/job.types'
import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('jobQueueManager', () => {
	let manager: JobQueueManager
	let mockQueueService: MockedObject<BullQueueService>
	let mockImageProcessor: MockedObject<ImageProcessingProcessor>
	let mockCacheProcessor: MockedObject<CacheOperationsProcessor>
	let mockCorrelationService: MockedObject<CorrelationService>

	beforeEach(async () => {
		const mockQueueServiceFactory = {
			add: vi.fn(),
			process: vi.fn(),
			getJob: vi.fn(),
			removeJob: vi.fn(),
			pause: vi.fn(),
			resume: vi.fn(),
			getStats: vi.fn(),
			clean: vi.fn(),
		}

		const mockImageProcessorFactory = {
			process: vi.fn(),
		}

		const mockCacheProcessorFactory = {
			processCacheWarming: vi.fn(),
			processCacheCleanup: vi.fn(),
		}

		const mockCorrelationServiceFactory = {
			getCorrelationId: vi.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				JobQueueManager,
				{
					provide: BullQueueService,
					useValue: mockQueueServiceFactory,
				},
				{
					provide: ImageProcessingProcessor,
					useValue: mockImageProcessorFactory,
				},
				{
					provide: CacheOperationsProcessor,
					useValue: mockCacheProcessorFactory,
				},
				{
					provide: CorrelationService,
					useValue: mockCorrelationServiceFactory,
				},
			],
		}).compile()

		manager = module.get<JobQueueManager>(JobQueueManager)
		mockQueueService = module.get(BullQueueService)
		mockImageProcessor = module.get(ImageProcessingProcessor)
		mockCacheProcessor = module.get(CacheOperationsProcessor)
		mockCorrelationService = module.get(CorrelationService)

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

	describe('onModuleInit', () => {
		it('should setup job processors on initialization', async () => {
			await manager.onModuleInit()

			expect(mockQueueService.process).toHaveBeenCalledTimes(3)
			expect(mockQueueService.process).toHaveBeenCalledWith(JobType.IMAGE_PROCESSING, expect.any(Function))
			expect(mockQueueService.process).toHaveBeenCalledWith(JobType.CACHE_WARMING, expect.any(Function))
			expect(mockQueueService.process).toHaveBeenCalledWith(JobType.CACHE_CLEANUP, expect.any(Function))
		})
	})

	describe('addImageProcessingJob', () => {
		it('should add image processing job with correlation ID', async () => {
			const jobData = {
				imageUrl: 'https://example.com/image.jpg',
				width: 300,
				height: 200,
				cacheKey: 'test-key',
				priority: JobPriority.NORMAL,
			}

			const mockJob = {
				id: 'job-123',
				name: JobType.IMAGE_PROCESSING,
				data: { ...jobData, correlationId: 'corr-123' },
			}

			mockCorrelationService.getCorrelationId.mockReturnValue('corr-123')
			mockQueueService.add.mockResolvedValue(mockJob as any)

			const result = await manager.addImageProcessingJob(jobData)

			expect(mockCorrelationService.getCorrelationId).toHaveBeenCalled()
			expect(mockQueueService.add).toHaveBeenCalledWith(
				JobType.IMAGE_PROCESSING,
				{ ...jobData, correlationId: 'corr-123' },
				expect.objectContaining({
					priority: JobPriority.NORMAL,
					attempts: 3,
					backoff: { type: 'exponential', delay: 2000 },
					removeOnComplete: 10,
					removeOnFail: 5,
				}),
			)
			expect(result).toBe(mockJob)
		})

		it('should use custom options when provided', async () => {
			const jobData = {
				imageUrl: 'https://example.com/image.jpg',
				cacheKey: 'test-key',
				priority: JobPriority.HIGH,
			}

			const customOptions: Partial<JobOptions> = {
				attempts: 5,
				timeout: 60000,
			}

			const mockJob = {
				id: 'job-456',
				name: JobType.IMAGE_PROCESSING,
				data: { ...jobData, correlationId: 'corr-456' },
			}

			mockCorrelationService.getCorrelationId.mockReturnValue('corr-456')
			mockQueueService.add.mockResolvedValue(mockJob as any)

			await manager.addImageProcessingJob(jobData, customOptions)

			expect(mockQueueService.add).toHaveBeenCalledWith(
				JobType.IMAGE_PROCESSING,
				{ ...jobData, correlationId: 'corr-456' },
				expect.objectContaining({
					priority: JobPriority.HIGH,
					attempts: 5,
					timeout: 60000,
				}),
			)
		})
	})

	describe('addCacheWarmingJob', () => {
		it('should add cache warming job with correlation ID', async () => {
			const jobData = {
				imageUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
				batchSize: 5,
				priority: JobPriority.LOW,
			}

			const mockJob = {
				id: 'cache-job-123',
				name: JobType.CACHE_WARMING,
				data: { ...jobData, correlationId: 'corr-123' },
			}

			mockCorrelationService.getCorrelationId.mockReturnValue('corr-123')
			mockQueueService.add.mockResolvedValue(mockJob as any)

			const result = await manager.addCacheWarmingJob(jobData)

			expect(mockQueueService.add).toHaveBeenCalledWith(
				JobType.CACHE_WARMING,
				{ ...jobData, correlationId: 'corr-123' },
				expect.objectContaining({
					priority: JobPriority.LOW,
					attempts: 2,
					backoff: { type: 'fixed', delay: 5000 },
					removeOnComplete: 5,
					removeOnFail: 3,
				}),
			)
			expect(result).toBe(mockJob)
		})
	})

	describe('addCacheCleanupJob', () => {
		it('should add cache cleanup job with correlation ID', async () => {
			const jobData = {
				maxAge: 3600000,
				maxSize: 1024 * 1024,
				priority: JobPriority.LOW,
			}

			const mockJob = {
				id: 'cleanup-job-123',
				name: JobType.CACHE_CLEANUP,
				data: { ...jobData, correlationId: 'corr-123' },
			}

			mockCorrelationService.getCorrelationId.mockReturnValue('corr-123')
			mockQueueService.add.mockResolvedValue(mockJob as any)

			const result = await manager.addCacheCleanupJob(jobData)

			expect(mockQueueService.add).toHaveBeenCalledWith(
				JobType.CACHE_CLEANUP,
				{ ...jobData, correlationId: 'corr-123' },
				expect.objectContaining({
					priority: JobPriority.LOW,
					attempts: 1,
					removeOnComplete: 3,
					removeOnFail: 1,
				}),
			)
			expect(result).toBe(mockJob)
		})
	})

	describe('getJobById', () => {
		it('should retrieve job by ID', async () => {
			const mockJob = {
				id: 'job-123',
				name: JobType.IMAGE_PROCESSING,
				data: { imageUrl: 'https://example.com/image.jpg' },
			}

			mockQueueService.getJob.mockResolvedValue(mockJob as any)

			const result = await manager.getJobById('job-123')

			expect(mockQueueService.getJob).toHaveBeenCalledWith('job-123')
			expect(result).toBe(mockJob)
		})

		it('should return null when job not found', async () => {
			mockQueueService.getJob.mockResolvedValue(null)

			const result = await manager.getJobById('nonexistent-job')

			expect(result).toBeNull()
		})
	})

	describe('removeJob', () => {
		it('should remove job by ID', async () => {
			mockQueueService.removeJob.mockResolvedValue(undefined)

			await manager.removeJob('job-123')

			expect(mockQueueService.removeJob).toHaveBeenCalledWith('job-123')
		})
	})

	describe('pauseQueues', () => {
		it('should pause all queues', async () => {
			mockQueueService.pause.mockResolvedValue(undefined)

			await manager.pauseQueues()

			expect(mockQueueService.pause).toHaveBeenCalled()
		})
	})

	describe('resumeQueues', () => {
		it('should resume all queues', async () => {
			mockQueueService.resume.mockResolvedValue(undefined)

			await manager.resumeQueues()

			expect(mockQueueService.resume).toHaveBeenCalled()
		})
	})

	describe('getQueueStats', () => {
		it('should return comprehensive queue statistics', async () => {
			const mockQueueStats = {
				waiting: 5,
				active: 2,
				completed: 100,
				failed: 3,
				delayed: 1,
				paused: false,
			}

			mockQueueService.getStats.mockResolvedValue(mockQueueStats)

			// Simulate some metrics
			;(manager as any).metrics = {
				totalJobs: 108,
				completedJobs: 100,
				failedJobs: 3,
				processingTimes: [1000, 1500, 2000, 1200, 1800],
			}

			const result = await manager.getQueueStats()

			expect(result).toEqual({
				totalJobs: 108,
				completedJobs: 100,
				failedJobs: 3,
				averageProcessingTime: 1500, // (1000+1500+2000+1200+1800)/5
				queueLength: 6, // waiting + delayed
				activeWorkers: 2,
			})
		})

		it('should handle empty processing times', async () => {
			const mockQueueStats = {
				waiting: 0,
				active: 0,
				completed: 0,
				failed: 0,
				delayed: 0,
				paused: false,
			}

			mockQueueService.getStats.mockResolvedValue(mockQueueStats)

			// Empty metrics
			;(manager as any).metrics = {
				totalJobs: 0,
				completedJobs: 0,
				failedJobs: 0,
				processingTimes: [],
			}

			const result = await manager.getQueueStats()

			expect(result.averageProcessingTime).toBe(0)
		})
	})

	describe('cleanCompletedJobs', () => {
		it('should clean completed jobs with default age', async () => {
			mockQueueService.clean.mockResolvedValue(undefined)

			await manager.cleanCompletedJobs()

			expect(mockQueueService.clean).toHaveBeenCalledWith(24 * 60 * 60 * 1000, 'completed')
		})

		it('should clean completed jobs with custom age', async () => {
			mockQueueService.clean.mockResolvedValue(undefined)

			await manager.cleanCompletedJobs(12 * 60 * 60 * 1000) // 12 hours

			expect(mockQueueService.clean).toHaveBeenCalledWith(12 * 60 * 60 * 1000, 'completed')
		})
	})

	describe('cleanFailedJobs', () => {
		it('should clean failed jobs with default age', async () => {
			mockQueueService.clean.mockResolvedValue(undefined)

			await manager.cleanFailedJobs()

			expect(mockQueueService.clean).toHaveBeenCalledWith(7 * 24 * 60 * 60 * 1000, 'failed')
		})

		it('should clean failed jobs with custom age', async () => {
			mockQueueService.clean.mockResolvedValue(undefined)

			await manager.cleanFailedJobs(3 * 24 * 60 * 60 * 1000) // 3 days

			expect(mockQueueService.clean).toHaveBeenCalledWith(3 * 24 * 60 * 60 * 1000, 'failed')
		})
	})

	describe('job processors', () => {
		beforeEach(async () => {
			await manager.onModuleInit()
		})

		it('should process image processing jobs successfully', async () => {
			const mockJob = {
				id: 'job-123',
				name: JobType.IMAGE_PROCESSING,
				data: { imageUrl: 'https://example.com/image.jpg' },
			}

			const mockResult = { success: true, data: 'processed-image', processingTime: 1000 }
			mockImageProcessor.process.mockResolvedValue(mockResult)

			// Mock queue stats
			mockQueueService.getStats.mockResolvedValue({
				waiting: 0,
				active: 0,
				completed: 1,
				failed: 0,
				delayed: 0,
				paused: false,
			})

			// Get the processor function that was registered
			const processorCall = mockQueueService.process.mock.calls.find(
				call => call[0] === JobType.IMAGE_PROCESSING,
			)
			const processor = processorCall![1]

			const result = await processor(mockJob as any)

			expect(mockImageProcessor.process).toHaveBeenCalledWith(mockJob)
			expect(result).toBe(mockResult)

			// Check metrics were updated
			const stats = await manager.getQueueStats()
			expect(stats.completedJobs).toBe(1)
		})

		it('should handle image processing job failures', async () => {
			const mockJob = {
				id: 'job-123',
				name: JobType.IMAGE_PROCESSING,
				data: { imageUrl: 'https://example.com/image.jpg' },
			}

			const error = new Error('Processing failed')
			mockImageProcessor.process.mockRejectedValue(error)

			// Mock queue stats
			mockQueueService.getStats.mockResolvedValue({
				waiting: 0,
				active: 0,
				completed: 0,
				failed: 1,
				delayed: 0,
				paused: false,
			})

			const processorCall = mockQueueService.process.mock.calls.find(
				call => call[0] === JobType.IMAGE_PROCESSING,
			)
			const processor = processorCall![1]

			await expect(processor(mockJob as any)).rejects.toThrow('Processing failed')

			// Check metrics were updated
			const stats = await manager.getQueueStats()
			expect(stats.failedJobs).toBe(1)
		})

		it('should process cache warming jobs successfully', async () => {
			const mockJob = {
				id: 'cache-job-123',
				name: JobType.CACHE_WARMING,
				data: { imageUrls: ['https://example.com/image.jpg'] },
			}

			const mockResult = { success: true, data: { successful: 1, failed: 0 }, processingTime: 1000 }
			mockCacheProcessor.processCacheWarming.mockResolvedValue(mockResult)

			const processorCall = mockQueueService.process.mock.calls.find(
				call => call[0] === JobType.CACHE_WARMING,
			)
			const processor = processorCall![1]

			const result = await processor(mockJob as any)

			expect(mockCacheProcessor.processCacheWarming).toHaveBeenCalledWith(mockJob)
			expect(result).toBe(mockResult)
		})

		it('should process cache cleanup jobs successfully', async () => {
			const mockJob = {
				id: 'cleanup-job-123',
				name: JobType.CACHE_CLEANUP,
				data: { maxAge: 3600000, maxSize: 1024 * 1024 },
			}

			const mockResult = { success: true, data: { cleaned: 5 }, processingTime: 1000 }
			mockCacheProcessor.processCacheCleanup.mockResolvedValue(mockResult)

			const processorCall = mockQueueService.process.mock.calls.find(
				call => call[0] === JobType.CACHE_CLEANUP,
			)
			const processor = processorCall![1]

			const result = await processor(mockJob as any)

			expect(mockCacheProcessor.processCacheCleanup).toHaveBeenCalledWith(mockJob)
			expect(result).toBe(mockResult)
		})
	})

	describe('updateMetrics', () => {
		it('should update metrics correctly for successful jobs', () => {
			const initialMetrics = (manager as any).metrics
			const initialCompleted = initialMetrics.completedJobs
			const initialProcessingTimes = [...initialMetrics.processingTimes]

			;(manager as any).updateMetrics(true, 1500)

			expect(initialMetrics.completedJobs).toBe(initialCompleted + 1)
			expect(initialMetrics.processingTimes).toEqual([...initialProcessingTimes, 1500])
		})

		it('should update metrics correctly for failed jobs', () => {
			const initialMetrics = (manager as any).metrics
			const initialFailed = initialMetrics.failedJobs

			;(manager as any).updateMetrics(false, 2000)

			expect(initialMetrics.failedJobs).toBe(initialFailed + 1)
		})

		it('should limit processing times to 1000 entries', () => {
			const metrics = (manager as any).metrics

			// Fill with 1000 entries
			metrics.processingTimes = Array.from({ length: 1000 }).fill(1000)

			;(manager as any).updateMetrics(true, 2000)

			expect(metrics.processingTimes).toHaveLength(1000)
			expect(metrics.processingTimes[999]).toBe(2000)
		})
	})
})
