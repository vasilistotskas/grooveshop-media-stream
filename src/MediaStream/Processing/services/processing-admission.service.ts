import type { OnModuleDestroy } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { ProcessingOverloadedError } from '#microservice/common/errors/media-stream.errors'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'

interface Waiter {
	resolve: () => void
	reject: (error: Error) => void
	timer: NodeJS.Timeout | null
}

/** Retry-After sent with every admission rejection. */
const RETRY_AFTER_SECONDS = 2

/**
 * Bounded admission for Sharp pipelines.
 *
 * libuv's thread pool already caps how many pipelines libvips runs at once,
 * but everything beyond that waits in Sharp's internal queue with no limit
 * and no deadline. On a 1-CPU pod a burst of cold misses turns that into
 * minutes of queueing, self-inflicted upstream timeouts and an OOM. This
 * semaphore keeps `maxConcurrent` pipelines running, lets at most `maxQueue`
 * requests wait up to `queueTimeoutMs`, and answers everything else with a
 * `ProcessingOverloadedError` (503 + Retry-After) so the caller backs off
 * instead of receiving the default image.
 */
@Injectable()
export class ProcessingAdmissionService implements OnModuleDestroy {
	private readonly maxConcurrent: number
	private readonly maxQueue: number
	private readonly queueTimeoutMs: number
	private inFlight = 0
	private readonly waiters: Waiter[] = []

	constructor(
		configService: ConfigService,
		private readonly metricsService: MetricsService,
	) {
		const configured = configService.get<number>('processing.maxConcurrent')
		const cpuCores = configService.get<number>('processing.cpuCores')
		this.maxConcurrent = Math.max(1, configured > 0 ? Math.floor(configured) : Math.ceil(cpuCores))
		this.maxQueue = Math.max(0, configService.get<number>('processing.maxQueue'))
		this.queueTimeoutMs = Math.max(0, configService.get<number>('processing.queueTimeoutMs'))
		CorrelatedLogger.log(`Processing admission: ${this.maxConcurrent} concurrent pipeline(s), queue ${this.maxQueue}, queue timeout ${this.queueTimeoutMs}ms`, ProcessingAdmissionService.name)
	}

	onModuleDestroy(): void {
		for (const waiter of this.waiters.splice(0)) {
			if (waiter.timer) {
				clearTimeout(waiter.timer)
			}
			waiter.reject(new ProcessingOverloadedError(RETRY_AFTER_SECONDS, { reason: 'shutdown' }))
		}
	}

	/** Current occupancy, for health and metrics. */
	get stats(): { inFlight: number, queued: number, maxConcurrent: number, maxQueue: number } {
		return { inFlight: this.inFlight, queued: this.waiters.length, maxConcurrent: this.maxConcurrent, maxQueue: this.maxQueue }
	}

	/** Run `fn` once a pipeline slot is available; rejects with ProcessingOverloadedError when it never becomes one. */
	async run<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire()
		try {
			return await fn()
		}
		finally {
			this.release()
		}
	}

	private acquire(): Promise<void> {
		if (this.inFlight < this.maxConcurrent) {
			this.inFlight++
			this.publish()
			return Promise.resolve()
		}

		if (this.waiters.length >= this.maxQueue) {
			this.metricsService.recordProcessingRejected('queue_full')
			CorrelatedLogger.warn(`Processing queue full (${this.waiters.length}/${this.maxQueue} waiting, ${this.inFlight} in flight); rejecting with 503`, ProcessingAdmissionService.name)
			return Promise.reject(new ProcessingOverloadedError(RETRY_AFTER_SECONDS, { reason: 'queue_full', queued: this.waiters.length, inFlight: this.inFlight }))
		}

		return new Promise<void>((resolve, reject) => {
			const waiter: Waiter = { resolve, reject, timer: null }
			if (this.queueTimeoutMs > 0) {
				waiter.timer = setTimeout(() => {
					const index = this.waiters.indexOf(waiter)
					if (index === -1) {
						return
					}
					this.waiters.splice(index, 1)
					this.publish()
					this.metricsService.recordProcessingRejected('queue_timeout')
					CorrelatedLogger.warn(`Processing slot not available within ${this.queueTimeoutMs}ms; rejecting with 503`, ProcessingAdmissionService.name)
					reject(new ProcessingOverloadedError(RETRY_AFTER_SECONDS, { reason: 'queue_timeout', waitedMs: this.queueTimeoutMs }))
				}, this.queueTimeoutMs)
			}
			this.waiters.push(waiter)
			this.publish()
		})
	}

	private release(): void {
		const next = this.waiters.shift()
		if (next) {
			// The slot passes straight to the next waiter; inFlight is unchanged.
			if (next.timer) {
				clearTimeout(next.timer)
			}
			next.resolve()
		}
		else {
			this.inFlight--
		}
		this.publish()
	}

	private publish(): void {
		this.metricsService.setProcessingAdmission(this.inFlight, this.waiters.length)
	}
}
