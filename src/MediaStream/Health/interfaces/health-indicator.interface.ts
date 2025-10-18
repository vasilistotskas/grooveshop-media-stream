import type { DetailsMap } from '#microservice/common/types/common.types'
import type { HealthIndicatorResult } from '@nestjs/terminus'

export interface IHealthIndicator {
	/**
	 * The unique key for this health indicator
	 */
	readonly key: string

	/**
	 * Check the health status of this component
	 * @returns Promise resolving to health indicator result
	 */
	isHealthy: () => Promise<HealthIndicatorResult>

	/**
	 * Get additional details about this health indicator
	 * @returns Object containing metadata about the health check
	 */
	getDetails: () => DetailsMap
}

export interface HealthCheckOptions {
	timeout?: number
	retries?: number
	threshold?: number
}

export interface HealthMetrics {
	timestamp: number
	status: 'healthy' | 'unhealthy' | 'degraded'
	responseTime: number
	details: DetailsMap
}
