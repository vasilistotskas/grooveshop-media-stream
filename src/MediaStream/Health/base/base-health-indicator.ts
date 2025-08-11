import type { HealthIndicatorResult } from '@nestjs/terminus'
import type { HealthCheckOptions, HealthMetrics, IHealthIndicator } from '../interfaces/health-indicator.interface'
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

			this.lastCheck = {
				timestamp: Date.now(),
				status: 'healthy',
				responseTime,
				details: result[this.key] || {},
			}

			this.logger.debug(`Health check passed for ${this.key} in ${responseTime}ms`)
			return result
		}
		catch (error: unknown) {
			const responseTime = Date.now() - startTime

			this.lastCheck = {
				timestamp: Date.now(),
				status: 'unhealthy',
				responseTime,
				details: { error: error instanceof Error ? (error as Error).message : 'Unknown error' },
			}

			this.logger.warn(`Health check failed for ${this.key}: ${error instanceof Error ? (error as Error).message : 'Unknown error'}`)

			return {
				[this.key]: {
					status: 'down',
					message: error instanceof Error ? (error as Error).message : 'Health check failed',
					timestamp: new Date().toISOString(),
					responseTime,
				},
			}
		}
	}

	/**
	 * Get details about this health indicator including last check results
	 */
	getDetails(): Record<string, any> {
		return {
			key: this.key,
			options: this.options,
			lastCheck: this.lastCheck,
			description: this.getDescription(),
		}
	}

	/**
	 * Get the last health check metrics
	 */
	getLastCheck(): HealthMetrics | undefined {
		return this.lastCheck
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
	protected createHealthyResult(details: Record<string, any> = {}): HealthIndicatorResult {
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
	protected createUnhealthyResult(message: string, _details: Record<string, any> = {}): HealthIndicatorResult {
		throw new Error(`${this.key} health check failed: ${message}`)
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
