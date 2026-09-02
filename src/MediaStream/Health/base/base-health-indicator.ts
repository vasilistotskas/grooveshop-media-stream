import type { HealthIndicatorResult } from '@nestjs/terminus'
import type { Metadata } from '#microservice/common/types/common.types'
import { Injectable } from '@nestjs/common'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

const DEFAULT_TIMEOUT_MS = 5000

/**
 * Base for every health indicator. Terminus 12 rethrows anything an indicator
 * rejects with (a 500 with no body), so `isHealthy()` converts throws into a
 * returned `down` result; subclasses may throw freely from `performHealthCheck`.
 */
@Injectable()
export abstract class BaseHealthIndicator {
	constructor(
		public readonly key: string,
		protected readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
	) {}

	async isHealthy(): Promise<HealthIndicatorResult> {
		const startTime = Date.now()

		try {
			const result = await this.performHealthCheck()
			const responseTime = Date.now() - startTime

			if (result[this.key]?.status === 'down') {
				CorrelatedLogger.warn(`Health check reported down for ${this.key} in ${responseTime}ms`, this.constructor.name)
			}
			else {
				CorrelatedLogger.debug(`Health check passed for ${this.key} in ${responseTime}ms`, this.constructor.name)
			}
			return result
		}
		catch (error: unknown) {
			const responseTime = Date.now() - startTime
			const message = errorMessage(error)
			CorrelatedLogger.warn(`Health check failed for ${this.key}: ${message}`, this.constructor.name)

			return {
				[this.key]: {
					status: 'down',
					message,
					timestamp: new Date().toISOString(),
					responseTime,
				},
			}
		}
	}

	protected abstract performHealthCheck(): Promise<HealthIndicatorResult>

	protected abstract getDescription(): string

	protected createHealthyResult(details: Metadata = {}): HealthIndicatorResult {
		return {
			[this.key]: {
				status: 'up',
				timestamp: new Date().toISOString(),
				...details,
			},
		}
	}

	protected createUnhealthyResult(message: string, details: Metadata = {}): HealthIndicatorResult {
		return {
			[this.key]: {
				status: 'down',
				message,
				timestamp: new Date().toISOString(),
				...details,
			},
		}
	}

	/** Rejects with a timeout error when `operation` outlives the indicator's budget. */
	protected async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number = this.timeoutMs): Promise<T> {
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
