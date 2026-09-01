import type { HealthIndicatorResult } from '@nestjs/terminus'
import type { DetailsMap } from '#microservice/common/types/common.types'
import type { HealthCheckOptions, HealthMetrics, IHealthIndicator } from '../interfaces/health-indicator.interface.js'
import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export abstract class BaseHealthIndicator implements IHealthIndicator {
	protected readonly logger: Logger
	protected readonly options: HealthCheckOptions
	private lastCheck?: HealthMetrics

	constructor(
		public readonly key: string,
		options: HealthCheckOptions = {},
	) {
		this.logger = new Logger(`${this.constructor.name}`)
		this.options = {
			timeout: 5000,
			retries: 3,
			threshold: 0.8,
			...options,
		}
	}

	/**
	 * Public method to check health with error handling and metrics
	 */
	async isHealthy(): Promise<HealthIndicatorResult> {
		const startTime = Date.now()

		try {
			const result = await this.performHealthCheck()
			const responseTime = Date.now() - startTime

			// performHealthCheck() may legitimately *return* a `down` result via
			// createUnhealthyResult() instead of throwing, so record what it
			// actually reported rather than assuming the check passed.
			const reported = result[this.key]
			const isDown = reported?.status === 'down'

			this.lastCheck = {
				timestamp: Date.now(),
				status: isDown ? 'unhealthy' : 'healthy',
				responseTime,
				details: reported || {},
			}

			if (isDown) {
				this.logger.warn(`Health check reported down for ${this.key} in ${responseTime}ms`)
			}
			else {
				this.logger.debug(`Health check passed for ${this.key} in ${responseTime}ms`)
			}
			return result
		}
		catch (error: unknown) {
			const responseTime = Date.now() - startTime
			const message = error instanceof Error ? (error as Error).message : 'Health check failed'

			this.lastCheck = {
				timestamp: Date.now(),
				status: 'unhealthy',
				responseTime,
				details: { error: message },
			}

			this.logger.warn(`Health check failed for ${this.key}: ${message}`)

			// Terminus 12 removed HealthCheckError: its executor rethrows any
			// rejected indicator promise, which escapes HealthCheckService as a
			// 500 with no health payload. Returning the `down` result keeps the
			// failure inside the aggregated report so /health still answers 503.
			const downResult: HealthIndicatorResult = {
				[this.key]: {
					status: 'down',
					message,
					timestamp: new Date().toISOString(),
					responseTime,
				},
			}

			return downResult
		}
	}

	/**
	 * Get details about this health indicator including last check results
	 */
	getDetails(): DetailsMap {
		return {
			key: this.key,
			options: this.options,
			lastCheck: this.lastCheck,
			description: this.getDescription(),
		}
	}

	/**
	 * Abstract method that subclasses must implement to perform the actual health check
	 */
	protected abstract performHealthCheck(): Promise<HealthIndicatorResult>

	/**
	 * Abstract method that subclasses should implement to provide a description
	 */
	protected abstract getDescription(): string

	/**
	 * Helper method to create a healthy result
	 */
	protected createHealthyResult(details: DetailsMap = {}): HealthIndicatorResult {
		return {
			[this.key]: {
				status: 'up',
				timestamp: new Date().toISOString(),
				...details,
			},
		}
	}

	/**
	 * Helper method to create an unhealthy result
	 */
	protected createUnhealthyResult(message: string, details: DetailsMap = {}): HealthIndicatorResult {
		return {
			[this.key]: {
				status: 'down',
				message,
				timestamp: new Date().toISOString(),
				...details,
			},
		}
	}

	/**
	 * Helper method to execute with timeout
	 */
	protected async executeWithTimeout<T>(
		operation: () => Promise<T>,
		timeoutMs: number = this.options.timeout || 5000,
	): Promise<T> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error(`Health check timeout after ${timeoutMs}ms`))
			}, timeoutMs)

			operation()
				.then(resolve)
				.catch(reject)
				.finally(() => clearTimeout(timer))
		})
	}
}
