import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { CorrelationService } from '../../Correlation/services/correlation.service'
import { Job, JobOptions } from '../interfaces/job-queue.interface'
import { CacheOperationsProcessor } from '../processors/cache-operations.processor'
import { ImageProcessingProcessor } from '../processors/image-processing.processor'
import {
	CacheCleanupJobData,
	CacheWarmingJobData,
	ImageProcessingJobData,
	JobMetrics,
	JobPriority,
	JobType,
} from '../types/job.types'
import { BullQueueService } from './bull-queue.service'

@Injectable()
export class JobQueueManager implements OnModuleInit {
	private readonly _logger = new Logger(JobQueueManager.name)
	private readonly metrics = {
		totalJobs: 0,
		completedJobs: 0,
		failedJobs: 0,
		processingTimes: [] as number[],
	}

	constructor(
		private readonly queueService: BullQueueService,
		private readonly imageProcessor: ImageProcessingProcessor,
		private readonly cacheProcessor: CacheOperationsProcessor,
		private readonly _correlationService: CorrelationService,
	) {}

	async onModuleInit(): Promise<void> {
		this.setupJobProcessors()
		this._logger.log('Job queue manager initialized')
	}

	async addImageProcessingJob(
		data: Omit<ImageProcessingJobData, 'correlationId'>,
		options: Partial<JobOptions> = {},
	): Promise<Job<ImageProcessingJobData>> {
		const correlationId = this._correlationService.getCorrelationId()

		const jobData: ImageProcessingJobData = {
			...data,
			correlationId,
		}

		const jobOptions: JobOptions = {
			priority: data.priority || JobPriority.NORMAL,
			attempts: 3,
			backoff: { type: 'exponential', delay: 2000 },
			removeOnComplete: 10,
			removeOnFail: 5,
			...options,
		}

		this.metrics.totalJobs++

		this._logger.debug(`Adding image processing job for URL: ${data.imageUrl}`)

		return await this.queueService.add(JobType.IMAGE_PROCESSING, jobData, jobOptions)
	}

	async addCacheWarmingJob(
		data: Omit<CacheWarmingJobData, 'correlationId'>,
		options: Partial<JobOptions> = {},
	): Promise<Job<CacheWarmingJobData>> {
		const correlationId = this._correlationService.getCorrelationId()

		const jobData: CacheWarmingJobData = {
			...data,
			correlationId,
		}

		const jobOptions: JobOptions = {
			priority: data.priority || JobPriority.LOW,
			attempts: 2,
			backoff: { type: 'fixed', delay: 5000 },
			removeOnComplete: 5,
			removeOnFail: 3,
			...options,
		}

		this.metrics.totalJobs++

		this._logger.debug(`Adding cache warming job for ${data.imageUrls.length} images`)

		return await this.queueService.add(JobType.CACHE_WARMING, jobData, jobOptions)
	}

	async addCacheCleanupJob(
		data: Omit<CacheCleanupJobData, 'correlationId'>,
		options: Partial<JobOptions> = {},
	): Promise<Job<CacheCleanupJobData>> {
		const correlationId = this._correlationService.getCorrelationId()

		const jobData: CacheCleanupJobData = {
			...data,
			correlationId,
		}

		const jobOptions: JobOptions = {
			priority: data.priority || JobPriority.LOW,
			attempts: 1,
			removeOnComplete: 3,
			removeOnFail: 1,
			...options,
		}

		this.metrics.totalJobs++

		this._logger.debug('Adding cache cleanup job')

		return await this.queueService.add(JobType.CACHE_CLEANUP, jobData, jobOptions)
	}

	async getJobById(jobId: string): Promise<Job | null> {
		return await this.queueService.getJob(jobId)
	}

	async removeJob(jobId: string): Promise<void> {
		await this.queueService.removeJob(jobId)
	}

	async pauseQueues(): Promise<void> {
		await this.queueService.pause()
		this._logger.log('All queues paused')
	}

	async resumeQueues(): Promise<void> {
		await this.queueService.resume()
		this._logger.log('All queues resumed')
	}

	async getQueueStats(): Promise<JobMetrics> {
		const queueStats = await this.queueService.getStats()

		const averageProcessingTime = this.metrics.processingTimes.length > 0
			? this.metrics.processingTimes.reduce((a: any, b: any) => a + b, 0) / this.metrics.processingTimes.length
			: 0

		return {
			totalJobs: this.metrics.totalJobs,
			completedJobs: this.metrics.completedJobs,
			failedJobs: this.metrics.failedJobs,
			averageProcessingTime,
			queueLength: queueStats.waiting + queueStats.delayed,
			activeWorkers: queueStats.active,
		}
	}

	async cleanCompletedJobs(olderThan: number = 24 * 60 * 60 * 1000): Promise<void> {
		await this.queueService.clean(olderThan, 'completed')
		this._logger.debug(`Cleaned completed jobs older than ${olderThan}ms`)
	}

	async cleanFailedJobs(olderThan: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
		await this.queueService.clean(olderThan, 'failed')
		this._logger.debug(`Cleaned failed jobs older than ${olderThan}ms`)
	}

	private setupJobProcessors(): void {
		// Setup image processing job processor
		this.queueService.process(JobType.IMAGE_PROCESSING, async (job) => {
			const startTime = Date.now()

			try {
				const result = await this.imageProcessor.process(job)

				const processingTime = Date.now() - startTime
				this.updateMetrics(true, processingTime)

				return result
			}
			catch (error: unknown) {
				const processingTime = Date.now() - startTime
				this.updateMetrics(false, processingTime)

				throw error
			}
		})

		// Setup cache warming job processor
		this.queueService.process(JobType.CACHE_WARMING, async (job) => {
			const startTime = Date.now()

			try {
				const result = await this.cacheProcessor.processCacheWarming(job)

				const processingTime = Date.now() - startTime
				this.updateMetrics(true, processingTime)

				return result
			}
			catch (error: unknown) {
				const processingTime = Date.now() - startTime
				this.updateMetrics(false, processingTime)

				throw error
			}
		})

		// Setup cache cleanup job processor
		this.queueService.process(JobType.CACHE_CLEANUP, async (job) => {
			const startTime = Date.now()

			try {
				const result = await this.cacheProcessor.processCacheCleanup(job)

				const processingTime = Date.now() - startTime
				this.updateMetrics(true, processingTime)

				return result
			}
			catch (error: unknown) {
				const processingTime = Date.now() - startTime
				this.updateMetrics(false, processingTime)

				throw error
			}
		})

		this._logger.debug('Job processors configured')
	}

	private updateMetrics(success: boolean, processingTime: number): void {
		if (success) {
			this.metrics.completedJobs++
		}
		else {
			this.metrics.failedJobs++
		}

		this.metrics.processingTimes.push(processingTime)

		// Keep only last 1000 processing times for average calculation
		if (this.metrics.processingTimes.length > 1000) {
			this.metrics.processingTimes = this.metrics.processingTimes.slice(-1000)
		}
	}
}
