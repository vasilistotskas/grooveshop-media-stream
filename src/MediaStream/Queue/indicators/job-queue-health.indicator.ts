import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator'
import { Injectable } from '@nestjs/common'
import { HealthIndicatorResult } from '@nestjs/terminus'
import { JobQueueManager } from '../services/job-queue.manager'

@Injectable()
export class JobQueueHealthIndicator extends BaseHealthIndicator {
	constructor(private readonly jobQueueManager: JobQueueManager) {
		super('job-queue')
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		try {
			const stats = await this.jobQueueManager.getQueueStats()

			const maxQueueLength = 1000
			const maxFailureRate = 0.1

			const failureRate = stats.totalJobs > 0
				? stats.failedJobs / stats.totalJobs
				: 0

			const isHealthy
				= stats.queueLength < maxQueueLength
					&& failureRate < maxFailureRate

			const details = {
				queueLength: stats.queueLength,
				activeWorkers: stats.activeWorkers,
				totalJobs: stats.totalJobs,
				completedJobs: stats.completedJobs,
				failedJobs: stats.failedJobs,
				failureRate: Math.round(failureRate * 100) / 100,
				averageProcessingTime: Math.round(stats.averageProcessingTime),
			}

			if (!isHealthy) {
				return this.createUnhealthyResult('Job queue is unhealthy', details)
			}

			return this.createHealthyResult(details)
		}
		catch (error: unknown) {
			return this.createUnhealthyResult('Job queue health check failed', {
				error: (error as Error).message,
			})
		}
	}

	protected getDescription(): string {
		return 'Monitors job queue health including queue length, failure rates, and processing times'
	}
}
