import type { JobOptions, JobProcessor } from '#microservice/Queue/interfaces/job-queue.interface'
import type { Job as BullJob, Queue } from 'bull'
import type { MockedObject } from 'vitest'
import { BullQueueService } from '#microservice/Queue/services/bull-queue.service'
import { JobType } from '#microservice/Queue/types/job.types'
import { getQueueToken } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('bullQueueService', () => {
	let service: BullQueueService
	let mockImageQueue: MockedObject<Queue>
	let mockCacheQueue: MockedObject<Queue>

	beforeEach(async () => {
		const mockQueueFactory = () => ({
			add: vi.fn(),
			process: vi.fn(),
			getJob: vi.fn(),
			getWaiting: vi.fn(),
			getActive: vi.fn(),
			getCompleted: vi.fn(),
			getFailed: vi.fn(),
			getDelayed: vi.fn(),
			isPaused: vi.fn(),
			pause: vi.fn(),
			resume: vi.fn(),
			clean: vi.fn(),
			close: vi.fn(),
		})

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				BullQueueService,
				{
					provide: getQueueToken('image-processing'),
					useFactory: mockQueueFactory,
				},
				{
					provide: getQueueToken('cache-operations'),
					useFactory: mockQueueFactory,
				},
			],
		}).compile()

		service = module.get<BullQueueService>(BullQueueService)
		mockImageQueue = module.get(getQueueToken('image-processing'))
		mockCacheQueue = module.get(getQueueToken('cache-operations'))

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

	describe('add', () => {
		it('should add job to image processing queue', async () => {
			const jobData = { imageUrl: 'https://example.com/image.jpg' }
			const options: JobOptions = { priority: 1, attempts: 3 }

			const mockBullJob = {
				id: 'job-123',
				name: JobType.IMAGE_PROCESSING,
				data: jobData,
				opts: options,
				progress: vi.fn().mockReturnValue(0),
				timestamp: Date.now(),
				attemptsMade: 0,
				failedReason: null,
				stacktrace: null,
				returnvalue: null,
				finishedOn: null,
				processedOn: null,
			} as any

			mockImageQueue.add.mockResolvedValue(mockBullJob)

			const result = await service.add(JobType.IMAGE_PROCESSING, jobData, options)

			expect(mockImageQueue.add).toHaveBeenCalledWith(
				JobType.IMAGE_PROCESSING,
				jobData,
				expect.objectContaining({
					priority: 1,
					attempts: 3,
					backoff: { type: 'exponential', delay: 2000 },
					timeout: 30000,
					removeOnComplete: 10,
					removeOnFail: 5,
				}),
			)
			expect(result.id).toBe('job-123')
			expect(result.name).toBe(JobType.IMAGE_PROCESSING)
			expect(result.data).toBe(jobData)
		})

		it('should add job to cache operations queue', async () => {
			const jobData = { imageUrls: ['https://example.com/image.jpg'] }
			const options: JobOptions = { delay: 5000 }

			const mockBullJob = {
				id: 'cache-job-456',
				name: 'cache-warming',
				data: jobData,
				opts: options,
				progress: vi.fn().mockReturnValue(0),
				timestamp: Date.now(),
				attemptsMade: 0,
				failedReason: null,
				stacktrace: null,
				returnvalue: null,
				finishedOn: null,
				processedOn: null,
			} as any

			mockCacheQueue.add.mockResolvedValue(mockBullJob)

			const result = await service.add('cache-warming', jobData, options)

			expect(mockCacheQueue.add).toHaveBeenCalledWith(
				'cache-warming',
				jobData,
				expect.objectContaining({
					delay: 5000,
					attempts: 3,
					timeout: 30000,
				}),
			)
			expect(result.id).toBe('cache-job-456')
		})

		it('should handle job addition errors', async () => {
			const jobData = { imageUrl: 'https://example.com/image.jpg' }
			const error = new Error('Queue connection failed')

			mockImageQueue.add.mockRejectedValue(error)

			await expect(service.add(JobType.IMAGE_PROCESSING, jobData)).rejects.toThrow(
				'Queue connection failed',
			)
		})
	})

	describe('process', () => {
		it('should register job processor', () => {
			const mockProcessor: JobProcessor = vi.fn().mockResolvedValue({ success: true })

			service.process(JobType.IMAGE_PROCESSING, mockProcessor)

			expect(mockImageQueue.process).toHaveBeenCalledWith(
				JobType.IMAGE_PROCESSING,
				expect.any(Function),
			)
		})

		it('should execute processor when job is processed', async () => {
			const mockProcessor: JobProcessor = vi.fn().mockResolvedValue({ success: true })
			const jobData = { imageUrl: 'https://example.com/image.jpg' }

			const mockBullJob = {
				id: 'job-123',
				name: JobType.IMAGE_PROCESSING,
				data: jobData,
				opts: {},
				progress: vi.fn().mockReturnValue(50),
				timestamp: Date.now(),
				attemptsMade: 1,
				failedReason: null,
				stacktrace: null,
				returnvalue: null,
				finishedOn: null,
				processedOn: Date.now(),
			} as any

			let processorCallback: (job: BullJob) => Promise<any>

			mockImageQueue.process.mockImplementation((name, callback) => {
				processorCallback = callback as any
				return Promise.resolve()
			})

			service.process(JobType.IMAGE_PROCESSING, mockProcessor)

			const result = await processorCallback!(mockBullJob)

			expect(mockProcessor).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'job-123',
					name: JobType.IMAGE_PROCESSING,
					data: jobData,
				}),
			)
			expect(result).toEqual({ success: true })
		})

		it('should handle processor errors', async () => {
			const mockProcessor: JobProcessor = vi.fn().mockRejectedValue(new Error('Processing failed'))
			const jobData = { imageUrl: 'https://example.com/image.jpg' }

			const mockBullJob = {
				id: 'job-123',
				name: JobType.IMAGE_PROCESSING,
				data: jobData,
				opts: {},
				progress: vi.fn().mockReturnValue(0),
				timestamp: Date.now(),
				attemptsMade: 1,
				failedReason: null,
				stacktrace: null,
				returnvalue: null,
				finishedOn: null,
				processedOn: null,
			} as any

			let processorCallback: (job: BullJob) => Promise<any>

			mockImageQueue.process.mockImplementation((name, callback) => {
				processorCallback = callback as any
				return Promise.resolve()
			})

			service.process(JobType.IMAGE_PROCESSING, mockProcessor)

			await expect(processorCallback!(mockBullJob)).rejects.toThrow('Processing failed')
		})
	})

	describe('getStats', () => {
		it('should return combined queue statistics', async () => {
			// Mock image queue stats
			mockImageQueue.getWaiting.mockResolvedValue([{}, {}] as any) // 2 waiting
			mockImageQueue.getActive.mockResolvedValue([{}] as any) // 1 active
			mockImageQueue.getCompleted.mockResolvedValue([{}, {}, {}] as any) // 3 completed
			mockImageQueue.getFailed.mockResolvedValue([{}] as any) // 1 failed
			mockImageQueue.getDelayed.mockResolvedValue([]) // 0 delayed
			mockImageQueue.isPaused.mockResolvedValue(false)

			// Mock cache queue stats
			mockCacheQueue.getWaiting.mockResolvedValue([{}] as any) // 1 waiting
			mockCacheQueue.getActive.mockResolvedValue([]) // 0 active
			mockCacheQueue.getCompleted.mockResolvedValue([{}, {}] as any) // 2 completed
			mockCacheQueue.getFailed.mockResolvedValue([]) // 0 failed
			mockCacheQueue.getDelayed.mockResolvedValue([{}] as any) // 1 delayed
			mockCacheQueue.isPaused.mockResolvedValue(false)

			const stats = await service.getStats()

			expect(stats).toEqual({
				waiting: 3, // 2 + 1
				active: 1, // 1 + 0
				completed: 5, // 3 + 2
				failed: 1, // 1 + 0
				delayed: 1, // 0 + 1
				paused: false, // false && false
			})
		})

		it('should handle stats retrieval errors', async () => {
			mockImageQueue.getWaiting.mockRejectedValue(new Error('Queue connection error'))

			await expect(service.getStats()).rejects.toThrow('Queue connection error')
		})
	})

	describe('getJob', () => {
		it('should find job in image queue', async () => {
			const mockBullJob = {
				id: 'job-123',
				name: JobType.IMAGE_PROCESSING,
				data: { imageUrl: 'https://example.com/image.jpg' },
				opts: {},
				progress: vi.fn().mockReturnValue(75),
				timestamp: Date.now(),
				attemptsMade: 1,
				failedReason: null,
				stacktrace: null,
				returnvalue: null,
				finishedOn: null,
				processedOn: Date.now(),
			} as any

			mockImageQueue.getJob.mockResolvedValue(mockBullJob)
			mockCacheQueue.getJob.mockResolvedValue(null)

			const job = await service.getJob('job-123')

			expect(job).toBeDefined()
			expect(job!.id).toBe('job-123')
			expect(job!.name).toBe(JobType.IMAGE_PROCESSING)
		})

		it('should find job in cache queue', async () => {
			const mockBullJob = {
				id: 'cache-job-456',
				name: 'cache-warming',
				data: { imageUrls: [] },
				opts: {},
				progress: vi.fn().mockReturnValue(100),
				timestamp: Date.now(),
				attemptsMade: 1,
				failedReason: null,
				stacktrace: null,
				returnvalue: { success: true },
				finishedOn: Date.now(),
				processedOn: Date.now(),
			} as any

			mockImageQueue.getJob.mockResolvedValue(null)
			mockCacheQueue.getJob.mockResolvedValue(mockBullJob)

			const job = await service.getJob('cache-job-456')

			expect(job).toBeDefined()
			expect(job!.id).toBe('cache-job-456')
			expect(job!.name).toBe('cache-warming')
		})

		it('should return null when job not found', async () => {
			mockImageQueue.getJob.mockResolvedValue(null)
			mockCacheQueue.getJob.mockResolvedValue(null)

			const job = await service.getJob('nonexistent-job')

			expect(job).toBeNull()
		})

		it('should handle job retrieval errors', async () => {
			mockImageQueue.getJob.mockRejectedValue(new Error('Job retrieval error'))
			mockCacheQueue.getJob.mockRejectedValue(new Error('Job retrieval error'))

			const job = await service.getJob('error-job')

			expect(job).toBeNull()
		})
	})

	describe('removeJob', () => {
		it('should remove job successfully', async () => {
			const mockBullJob = {
				id: 'job-123',
				name: JobType.IMAGE_PROCESSING,
				remove: vi.fn().mockResolvedValue(undefined),
			} as any

			// Mock getJob to return a job
			vi.spyOn(service, 'getJob').mockResolvedValue({
				id: 'job-123',
				name: JobType.IMAGE_PROCESSING,
				data: {},
			} as any)

			mockImageQueue.getJob.mockResolvedValue(mockBullJob)

			await service.removeJob('job-123')

			expect(mockBullJob.remove).toHaveBeenCalled()
		})

		it('should throw error when job not found', async () => {
			vi.spyOn(service, 'getJob').mockResolvedValue(null)

			await expect(service.removeJob('nonexistent-job')).rejects.toThrow(
				'Job nonexistent-job not found',
			)
		})

		it('should handle job removal errors', async () => {
			const mockBullJob = {
				id: 'job-123',
				name: JobType.IMAGE_PROCESSING,
				remove: vi.fn().mockRejectedValue(new Error('Removal failed')),
			} as any

			vi.spyOn(service, 'getJob').mockResolvedValue({
				id: 'job-123',
				name: JobType.IMAGE_PROCESSING,
				data: {},
			} as any)

			mockImageQueue.getJob.mockResolvedValue(mockBullJob)

			await expect(service.removeJob('job-123')).rejects.toThrow('Removal failed')
		})
	})

	describe('pause', () => {
		it('should pause all queues', async () => {
			mockImageQueue.pause.mockResolvedValue(undefined)
			mockCacheQueue.pause.mockResolvedValue(undefined)

			await service.pause()

			expect(mockImageQueue.pause).toHaveBeenCalled()
			expect(mockCacheQueue.pause).toHaveBeenCalled()
		})

		it('should handle pause errors', async () => {
			mockImageQueue.pause.mockRejectedValue(new Error('Pause failed'))

			await expect(service.pause()).rejects.toThrow('Pause failed')
		})
	})

	describe('resume', () => {
		it('should resume all queues', async () => {
			mockImageQueue.resume.mockResolvedValue(undefined)
			mockCacheQueue.resume.mockResolvedValue(undefined)

			await service.resume()

			expect(mockImageQueue.resume).toHaveBeenCalled()
			expect(mockCacheQueue.resume).toHaveBeenCalled()
		})

		it('should handle resume errors', async () => {
			mockCacheQueue.resume.mockRejectedValue(new Error('Resume failed'))

			await expect(service.resume()).rejects.toThrow('Resume failed')
		})
	})

	describe('clean', () => {
		it('should clean jobs from all queues', async () => {
			const grace = 60000 // 1 minute
			const status = 'completed'

			mockImageQueue.clean.mockResolvedValue([])
			mockCacheQueue.clean.mockResolvedValue([])

			await service.clean(grace, status as any)

			expect(mockImageQueue.clean).toHaveBeenCalledWith(grace, status)
			expect(mockCacheQueue.clean).toHaveBeenCalledWith(grace, status)
		})

		it('should handle clean errors', async () => {
			const grace = 60000
			const status = 'failed'

			mockImageQueue.clean.mockRejectedValue(new Error('Clean failed'))

			await expect(service.clean(grace, status as any)).rejects.toThrow('Clean failed')
		})
	})

	describe('onModuleDestroy', () => {
		it('should close all queue connections', async () => {
			mockImageQueue.close.mockResolvedValue(undefined)
			mockCacheQueue.close.mockResolvedValue(undefined)

			await service.onModuleDestroy()

			expect(mockImageQueue.close).toHaveBeenCalled()
			expect(mockCacheQueue.close).toHaveBeenCalled()
		})

		it('should handle close errors gracefully', async () => {
			mockImageQueue.close.mockRejectedValue(new Error('Close failed'))
			mockCacheQueue.close.mockResolvedValue(undefined)

			// Should not throw, just log error
			await expect(service.onModuleDestroy()).resolves.toBeUndefined()
		})
	})

	describe('convertToBullOptions', () => {
		it('should convert job options correctly', () => {
			const options: JobOptions = {
				priority: 5,
				delay: 1000,
				attempts: 5,
				timeout: 60000,
				removeOnComplete: 20,
				removeOnFail: 10,
				jobId: 'custom-job-id',
			}

			const bullOptions = (service as any).convertToBullOptions(options)

			expect(bullOptions).toEqual({
				priority: 5,
				delay: 1000,
				attempts: 5,
				repeat: undefined,
				backoff: { type: 'exponential', delay: 2000 },
				lifo: undefined,
				timeout: 60000,
				removeOnComplete: 20,
				removeOnFail: 10,
				jobId: 'custom-job-id',
			})
		})

		it('should use default values when options not provided', () => {
			const options: JobOptions = {}

			const bullOptions = (service as any).convertToBullOptions(options)

			expect(bullOptions).toEqual({
				priority: undefined,
				delay: undefined,
				attempts: 3,
				repeat: undefined,
				backoff: { type: 'exponential', delay: 2000 },
				lifo: undefined,
				timeout: 30000,
				removeOnComplete: 10,
				removeOnFail: 5,
				jobId: undefined,
			})
		})
	})
})
