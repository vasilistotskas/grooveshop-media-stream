import type { OnModuleDestroy } from '@nestjs/common'
import type { Job as BullJob, JobOptions as BullJobOptions, Queue } from 'bull'

import type { IJobQueue, Job, JobOptions, JobProcessor, JobStatus, QueueStats } from '../interfaces/job-queue.interface.js'
import { InjectQueue } from '@nestjs/bull'
import { Injectable, Logger } from '@nestjs/common'
import { SharpConfigService } from './sharp-config.service.js'

@Injectable()
export class BullQueueService implements IJobQueue, OnModuleDestroy {
	private readonly _logger = new Logger(BullQueueService.name)
	private readonly processors = new Map<string, JobProcessor>()

	constructor(
		@InjectQueue('cache-operations') private readonly cacheQueue: Queue,
		private readonly sharpConfigService: SharpConfigService,
	) {}

	async add<T = any>(name: string, data: T, options: JobOptions = {}): Promise<Job<T>> {
		try {
			const bullOptions: BullJobOptions = this.convertToBullOptions(options)

			const bullJob = await this.cacheQueue.add(name, data, bullOptions)

			this._logger.debug(`Job ${name} added to queue with ID: ${bullJob.id}`)

			return this.convertFromBullJob(bullJob)
		}
		catch (error: unknown) {
			this._logger.error(`Failed to add job ${name} to queue:`, error)
			throw error
		}
	}

	process<T = any>(name: string, processor: JobProcessor<T>): void {
		this.processors.set(name, processor)

		// Match Bull worker concurrency to Sharp's own concurrency so the number
		// of in-flight jobs never exceeds what Sharp can handle in parallel without
		// CPU contention. SharpConfigService.getConfiguration() reads the value
		// that was already applied to Sharp during onModuleInit.
		const sharpConcurrency = this.sharpConfigService.getConfiguration().concurrency

		this.cacheQueue.process(name, sharpConcurrency, async (bullJob: BullJob<T>) => {
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
	}

	async getStats(): Promise<QueueStats> {
		try {
			return await this.getQueueStats(this.cacheQueue)
		}
		catch (error: unknown) {
			this._logger.error('Failed to get queue stats:', error)
			throw error
		}
	}

	async getJob(jobId: string): Promise<Job | null> {
		try {
			const bullJob = await this.cacheQueue.getJob(jobId)
			return bullJob ? this.convertFromBullJob(bullJob) : null
		}
		catch (error: unknown) {
			this._logger.error(`Failed to get job ${jobId}:`, error)
			return null
		}
	}

	async removeJob(jobId: string): Promise<void> {
		try {
			const bullJob = await this.cacheQueue.getJob(jobId)

			if (!bullJob) {
				throw new Error(`Job ${jobId} not found`)
			}

			await bullJob.remove()
			this._logger.debug(`Job ${jobId} removed from queue`)
		}
		catch (error: unknown) {
			this._logger.error(`Failed to remove job ${jobId}:`, error)
			throw error
		}
	}

	async pause(): Promise<void> {
		try {
			await this.cacheQueue.pause()
			this._logger.log('All queues paused')
		}
		catch (error: unknown) {
			this._logger.error('Failed to pause queues:', error)
			throw error
		}
	}

	async resume(): Promise<void> {
		try {
			await this.cacheQueue.resume()
			this._logger.log('All queues resumed')
		}
		catch (error: unknown) {
			this._logger.error('Failed to resume queues:', error)
			throw error
		}
	}

	async clean(grace: number, status: JobStatus): Promise<void> {
		try {
			await this.cacheQueue.clean(grace, status as any)
			this._logger.debug(`Cleaned ${status} jobs older than ${grace}ms`)
		}
		catch (error: unknown) {
			this._logger.error(`Failed to clean ${status} jobs:`, error)
			throw error
		}
	}

	async onModuleDestroy(): Promise<void> {
		try {
			await this.cacheQueue.close()
			this._logger.log('Queue connections closed')
		}
		catch (error: unknown) {
			this._logger.error('Failed to close queue connections:', error)
		}
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
