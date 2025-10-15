import type { OnModuleDestroy } from '@nestjs/common'
import type { Job as BullJob, JobOptions as BullJobOptions, Queue } from 'bull'
import type { IJobQueue, Job, JobOptions, JobProcessor, JobStatus, QueueStats } from '../interfaces/job-queue.interface'
import { InjectQueue } from '@nestjs/bull'
import { Injectable, Logger } from '@nestjs/common'
import { JobType } from '../types/job.types'

@Injectable()
export class BullQueueService implements IJobQueue, OnModuleDestroy {
	private readonly _logger = new Logger(BullQueueService.name)
	private readonly processors = new Map<string, JobProcessor>()

	constructor(
		@InjectQueue('image-processing') private readonly imageQueue: Queue,
		@InjectQueue('cache-operations') private readonly cacheQueue: Queue,
	) {}

	async add<T = any>(name: string, data: T, options: JobOptions = {}): Promise<Job<T>> {
		try {
			const queue = this.getQueueForJobType(name)
			const bullOptions: BullJobOptions = this.convertToBullOptions(options)

			const bullJob = await queue.add(name, data, bullOptions)

			this._logger.debug(`Job ${name} added to queue with ID: ${bullJob.id}`)

			return this.convertFromBullJob(bullJob)
		}
		catch (error: unknown) {
			this._logger.error(`Failed to add job ${name} to queue:`, error)
			throw error
		}
	}

	process<T = any>(name: string, processor: JobProcessor<T>, concurrency: number = 5): void {
		this.processors.set(name, processor)

		const queue = this.getQueueForJobType(name)

		// Set concurrency to allow parallel processing
		queue.process(name, concurrency, async (bullJob: BullJob<T>) => {
			const job = this.convertFromBullJob(bullJob)

			try {
				this._logger.debug(`Processing job ${name} with ID: ${job.id}`)
				const result = await processor(job)
				this._logger.debug(`Job ${name} completed successfully`)
				return result
			}
			catch (error: unknown) {
				this._logger.error(`Job ${name} failed:`, error)
				throw error
			}
		})

		this._logger.log(`Queue processor registered for ${name} with concurrency: ${concurrency}`)
	}

	async getStats(): Promise<QueueStats> {
		try {
			const [imageStats, cacheStats] = await Promise.all([
				this.getQueueStats(this.imageQueue),
				this.getQueueStats(this.cacheQueue),
			])

			return {
				waiting: imageStats.waiting + cacheStats.waiting,
				active: imageStats.active + cacheStats.active,
				completed: imageStats.completed + cacheStats.completed,
				failed: imageStats.failed + cacheStats.failed,
				delayed: imageStats.delayed + cacheStats.delayed,
				paused: imageStats.paused && cacheStats.paused,
			}
		}
		catch (error: unknown) {
			this._logger.error('Failed to get queue stats:', error)
			throw error
		}
	}

	async getJob(jobId: string): Promise<Job | null> {
		try {
			const [imageJob, cacheJob] = await Promise.all([
				this.imageQueue.getJob(jobId),
				this.cacheQueue.getJob(jobId),
			])

			const bullJob = imageJob || cacheJob
			return bullJob ? this.convertFromBullJob(bullJob) : null
		}
		catch (error: unknown) {
			this._logger.error(`Failed to get job ${jobId}:`, error)
			return null
		}
	}

	async removeJob(jobId: string): Promise<void> {
		try {
			const job = await this.getJob(jobId)
			if (!job) {
				throw new Error(`Job ${jobId} not found`)
			}

			const queue = this.getQueueForJobType(job.name)
			const bullJob = await queue.getJob(jobId)

			if (bullJob) {
				await bullJob.remove()
				this._logger.debug(`Job ${jobId} removed from queue`)
			}
		}
		catch (error: unknown) {
			this._logger.error(`Failed to remove job ${jobId}:`, error)
			throw error
		}
	}

	async pause(): Promise<void> {
		try {
			await Promise.all([
				this.imageQueue.pause(),
				this.cacheQueue.pause(),
			])
			this._logger.log('All queues paused')
		}
		catch (error: unknown) {
			this._logger.error('Failed to pause queues:', error)
			throw error
		}
	}

	async resume(): Promise<void> {
		try {
			await Promise.all([
				this.imageQueue.resume(),
				this.cacheQueue.resume(),
			])
			this._logger.log('All queues resumed')
		}
		catch (error: unknown) {
			this._logger.error('Failed to resume queues:', error)
			throw error
		}
	}

	async clean(grace: number, status: JobStatus): Promise<void> {
		try {
			const bullStatus = status as any
			await Promise.all([
				this.imageQueue.clean(grace, bullStatus),
				this.cacheQueue.clean(grace, bullStatus),
			])
			this._logger.debug(`Cleaned ${status} jobs older than ${grace}ms`)
		}
		catch (error: unknown) {
			this._logger.error(`Failed to clean ${status} jobs:`, error)
			throw error
		}
	}

	async onModuleDestroy(): Promise<void> {
		try {
			await Promise.all([
				this.imageQueue.close(),
				this.cacheQueue.close(),
			])
			this._logger.log('Queue connections closed')
		}
		catch (error: unknown) {
			this._logger.error('Failed to close queue connections:', error)
		}
	}

	private getQueueForJobType(jobType: string): Queue {
		if (jobType === JobType.IMAGE_PROCESSING) {
			return this.imageQueue
		}
		return this.cacheQueue
	}

	private async getQueueStats(queue: Queue): Promise<QueueStats> {
		const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
			queue.getWaiting(),
			queue.getActive(),
			queue.getCompleted(),
			queue.getFailed(),
			queue.getDelayed(),
			queue.isPaused(),
		])

		return {
			waiting: waiting.length,
			active: active.length,
			completed: completed.length,
			failed: failed.length,
			delayed: delayed.length,
			paused,
		}
	}

	private convertToBullOptions(options: JobOptions): BullJobOptions {
		return {
			priority: options.priority,
			delay: options.delay,
			attempts: options.attempts || 3,
			repeat: options.repeat as any,
			backoff: options.backoff || { type: 'exponential', delay: 2000 },
			lifo: options.lifo,
			timeout: options.timeout || 30000,
			removeOnComplete: options.removeOnComplete ?? 10,
			removeOnFail: options.removeOnFail ?? 5,
			jobId: options.jobId,
		}
	}

	private convertFromBullJob<T = any>(bullJob: BullJob<T>): Job<T> {
		return {
			id: bullJob.id.toString(),
			name: bullJob.name,
			data: bullJob.data,
			opts: bullJob.opts as JobOptions,
			progress: bullJob.progress(),
			delay: (bullJob as any).delay || 0,
			timestamp: bullJob.timestamp,
			attemptsMade: bullJob.attemptsMade,
			failedReason: bullJob.failedReason,
			stacktrace: bullJob.stacktrace,
			returnvalue: bullJob.returnvalue,
			finishedOn: bullJob.finishedOn,
			processedOn: bullJob.processedOn,
		}
	}
}
