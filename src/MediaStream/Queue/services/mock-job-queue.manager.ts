import type { Job, JobOptions } from '../interfaces/job-queue.interface'
import type {
	CacheCleanupJobData,
	CacheWarmingJobData,
	ImageProcessingJobData,
	JobMetrics,
} from '../types/job.types'
import { Injectable, Logger } from '@nestjs/common'
import { JobPriority, JobType } from '../types/job.types'

/**
 * Mock JobQueueManager for Bun compatibility
 * Bull doesn't work with Bun, so this provides a no-op implementation
 * Jobs will be processed synchronously instead of being queued
 */
@Injectable()
export class MockJobQueueManager {
	private readonly _logger = new Logger(MockJobQueueManager.name)

	constructor() {
		this._logger.warn('Using MockJobQueueManager - Bull is not compatible with Bun. Jobs will not be queued.')
	}

	async addImageProcessingJob(
		_data: ImageProcessingJobData,
		_options?: JobOptions,
	): Promise<Job<ImageProcessingJobData>> {
		this._logger.debug('Image processing job skipped (mock mode)')
		return {
			id: `mock-${Date.now()}`,
			data: _data,
			type: JobType.IMAGE_PROCESSING,
			priority: _options?.priority || JobPriority.NORMAL,
			attempts: 0,
			timestamp: Date.now(),
		} as unknown as Job<ImageProcessingJobData>
	}

	async addCacheWarmingJob(
		_data: CacheWarmingJobData,
		_options?: JobOptions,
	): Promise<Job<CacheWarmingJobData>> {
		this._logger.debug('Cache warming job skipped (mock mode)')
		return {
			id: `mock-${Date.now()}`,
			data: _data,
			type: JobType.CACHE_WARMING,
			priority: _options?.priority || JobPriority.LOW,
			attempts: 0,
			timestamp: Date.now(),
		} as unknown as Job<CacheWarmingJobData>
	}

	async addCacheCleanupJob(
		_data: CacheCleanupJobData,
		_options?: JobOptions,
	): Promise<Job<CacheCleanupJobData>> {
		this._logger.debug('Cache cleanup job skipped (mock mode)')
		return {
			id: `mock-${Date.now()}`,
			data: _data,
			type: JobType.CACHE_CLEANUP,
			priority: _options?.priority || JobPriority.LOW,
			attempts: 0,
			timestamp: Date.now(),
		} as unknown as Job<CacheCleanupJobData>
	}

	async getQueueStats(): Promise<any> {
		return {
			waiting: 0,
			active: 0,
			completed: 0,
			failed: 0,
			delayed: 0,
			paused: 0,
		}
	}

	async getJobMetrics(): Promise<JobMetrics> {
		return {
			totalJobs: 0,
			completedJobs: 0,
			failedJobs: 0,
			averageProcessingTime: 0,
			queueLength: 0,
			activeWorkers: 0,
		}
	}

	async pauseQueue(_queueName: string): Promise<void> {
		this._logger.debug(`Queue pause skipped (mock mode): ${_queueName}`)
	}

	async resumeQueue(_queueName: string): Promise<void> {
		this._logger.debug(`Queue resume skipped (mock mode): ${_queueName}`)
	}

	async clearQueue(_queueName: string): Promise<void> {
		this._logger.debug(`Queue clear skipped (mock mode): ${_queueName}`)
	}
}
