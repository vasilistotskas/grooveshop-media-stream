import type { Job as BullJob, Queue } from 'bull'
import type { MockedObject } from 'vitest'
import type { JobOptions, JobProcessor } from '#microservice/Queue/interfaces/job-queue.interface'
import { getQueueToken } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BullQueueService } from '#microservice/Queue/services/bull-queue.service'
import { SharpConfigService } from '#microservice/Queue/services/sharp-config.service'
import { JobType } from '#microservice/Queue/types/job.types'

describe('bullQueueService', () => {
	let service: BullQueueService
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

		const mockSharpConfigService = {
			getConfiguration: vi.fn().mockReturnValue({ concurrency: 2 }),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				BullQueueService,
				{
					provide: getQueueToken('cache-operations'),
					useFactory: mockQueueFactory,
				},
				{
					provide: SharpConfigService,
					useValue: mockSharpConfigService,
				},
			],
		}).compile()

		service = module.get<BullQueueService>(BullQueueService)
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
		it('should add job to cache operations queue', async () => {
			const jobData = { imageUrls: ['https://example.com/image.jpg'] }
			const options: JobOptions = { delay: 5000 }

			const mockBullJob = {
				id: 'cache-job-456',
				name: JobType.CACHE_WARMING,
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

			const result = await service.add(JobType.CACHE_WARMING, jobData, options)

			expect(mockCacheQueue.add).toHaveBeenCalledWith(
				JobType.CACHE_WARMING,
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
			const jobData = { imageUrls: [] }
			const error = new Error('Queue connection failed')

			mockCacheQueue.add.mockRejectedValue(error)

			await expect(service.add(JobType.CACHE_WARMING, jobData)).rejects.toThrow(
				'Queue connection failed',
			)
		})
	})

	describe('process', () => {
		it('should register job processor', () => {
			const mockProcessor: JobProcessor = vi.fn().mockResolvedValue({ success: true })

			service.process(JobType.CACHE_WARMING, mockProcessor)

			// Production code passes concurrency as 2nd arg (from SharpConfigService)
			expect(mockCacheQueue.process).toHaveBeenCalledWith(
				JobType.CACHE_WARMING,
				expect.any(Number),
				expect.any(Function),
			)
		})

		it('should execute processor when job is processed', async () => {
			const mockProcessor: JobProcessor = vi.fn().mockResolvedValue({ success: true })
			const jobData = { imageUrls: ['https://example.com/image.jpg'] }

			const mockBullJob = {
				id: 'cache-job-123',
				name: JobType.CACHE_WARMING,
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

			// Production code calls queue.process(name, concurrency, callback)
			mockCacheQueue.process.mockImplementation((name, _concurrency, callback) => {
				processorCallback = callback as any
				return Promise.resolve()
			})

			service.process(JobType.CACHE_WARMING, mockProcessor)

			const result = await processorCallback!(mockBullJob)

			expect(mockProcessor).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'cache-job-123',
					name: JobType.CACHE_WARMING,
					data: jobData,
				}),
			)
			expect(result).toEqual({ success: true })
		})

		it('should handle processor errors', async () => {
			const mockProcessor: JobProcessor = vi.fn().mockRejectedValue(new Error('Processing failed'))
			const jobData = { imageUrls: [] }

			const mockBullJob = {
				id: 'cache-job-123',
				name: JobType.CACHE_WARMING,
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

			// Production code calls queue.process(name, concurrency, callback)
			mockCacheQueue.process.mockImplementation((name, _concurrency, callback) => {
				processorCallback = callback as any
				return Promise.resolve()
			})

			service.process(JobType.CACHE_WARMING, mockProcessor)

			await expect(processorCallback!(mockBullJob)).rejects.toThrow('Processing failed')
		})
	})

	describe('getStats', () => {
		it('should return cache queue statistics', async () => {
			mockCacheQueue.getWaiting.mockResolvedValue([{}] as any) // 1 waiting
			mockCacheQueue.getActive.mockResolvedValue([]) // 0 active
			mockCacheQueue.getCompleted.mockResolvedValue([{}, {}] as any) // 2 completed
			mockCacheQueue.getFailed.mockResolvedValue([]) // 0 failed
			mockCacheQueue.getDelayed.mockResolvedValue([{}] as any) // 1 delayed
			mockCacheQueue.isPaused.mockResolvedValue(false)

			const stats = await service.getStats()

			expect(stats).toEqual({
				waiting: 1,
				active: 0,
				completed: 2,
				failed: 0,
				delayed: 1,
				paused: false,
			})
		})

		it('should handle stats retrieval errors', async () => {
			mockCacheQueue.getWaiting.mockRejectedValue(new Error('Queue connection error'))

			await expect(service.getStats()).rejects.toThrow('Queue connection error')
		})
	})

	describe('getJob', () => {
		it('should find job in cache queue', async () => {
			const mockBullJob = {
				id: 'cache-job-456',
				name: JobType.CACHE_WARMING,
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

			mockCacheQueue.getJob.mockResolvedValue(mockBullJob)

			const job = await service.getJob('cache-job-456')

			expect(job).toBeDefined()
			expect(job!.id).toBe('cache-job-456')
			expect(job!.name).toBe(JobType.CACHE_WARMING)
		})

		it('should return null when job not found', async () => {
			mockCacheQueue.getJob.mockResolvedValue(null)

			const job = await service.getJob('nonexistent-job')

			expect(job).toBeNull()
		})

		it('should handle job retrieval errors', async () => {
			mockCacheQueue.getJob.mockRejectedValue(new Error('Job retrieval error'))

			const job = await service.getJob('error-job')

			expect(job).toBeNull()
		})
	})

	describe('removeJob', () => {
		it('should remove job successfully', async () => {
			const mockBullJob = {
				id: 'cache-job-123',
				name: JobType.CACHE_WARMING,
				remove: vi.fn().mockResolvedValue(undefined),
			} as any

			mockCacheQueue.getJob.mockResolvedValue(mockBullJob)

			await service.removeJob('cache-job-123')

			expect(mockBullJob.remove).toHaveBeenCalled()
		})

		it('should throw error when job not found', async () => {
			mockCacheQueue.getJob.mockResolvedValue(null)

			await expect(service.removeJob('nonexistent-job')).rejects.toThrow(
				'Job nonexistent-job not found',
			)
		})

		it('should handle job removal errors', async () => {
			const mockBullJob = {
				id: 'cache-job-123',
				name: JobType.CACHE_WARMING,
				remove: vi.fn().mockRejectedValue(new Error('Removal failed')),
			} as any

			mockCacheQueue.getJob.mockResolvedValue(mockBullJob)

			await expect(service.removeJob('cache-job-123')).rejects.toThrow('Removal failed')
		})
	})

	describe('pause', () => {
		it('should pause the queue', async () => {
			mockCacheQueue.pause.mockResolvedValue(undefined)

			await service.pause()

			expect(mockCacheQueue.pause).toHaveBeenCalled()
		})

		it('should handle pause errors', async () => {
			mockCacheQueue.pause.mockRejectedValue(new Error('Pause failed'))

			await expect(service.pause()).rejects.toThrow('Pause failed')
		})
	})

	describe('resume', () => {
		it('should resume the queue', async () => {
			mockCacheQueue.resume.mockResolvedValue(undefined)

			await service.resume()

			expect(mockCacheQueue.resume).toHaveBeenCalled()
		})

		it('should handle resume errors', async () => {
			mockCacheQueue.resume.mockRejectedValue(new Error('Resume failed'))

			await expect(service.resume()).rejects.toThrow('Resume failed')
		})
	})

	describe('clean', () => {
		it('should clean jobs from the queue', async () => {
			const grace = 60000 // 1 minute
			const status = 'completed'

			mockCacheQueue.clean.mockResolvedValue([])

			await service.clean(grace, status as any)

			expect(mockCacheQueue.clean).toHaveBeenCalledWith(grace, status)
		})

		it('should handle clean errors', async () => {
			const grace = 60000
			const status = 'failed'

			mockCacheQueue.clean.mockRejectedValue(new Error('Clean failed'))

			await expect(service.clean(grace, status as any)).rejects.toThrow('Clean failed')
		})
	})

	describe('onModuleDestroy', () => {
		it('should close the queue connection', async () => {
			mockCacheQueue.close.mockResolvedValue(undefined)

			await service.onModuleDestroy()

			expect(mockCacheQueue.close).toHaveBeenCalled()
		})

		it('should handle close errors gracefully', async () => {
			mockCacheQueue.close.mockRejectedValue(new Error('Close failed'))

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
