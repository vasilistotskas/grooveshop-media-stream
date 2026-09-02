import type { HealthIndicatorResult } from '@nestjs/terminus'
import type { HttpHealthCheckConfig } from '#microservice/Config/interfaces/app-config.interface'
import { Injectable } from '@nestjs/common'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { BaseHealthIndicator } from '#microservice/Health/base/base-health-indicator'
import { HttpClientService } from '../services/http-client.service.js'

interface EndpointCheck {
	url: string
	success: boolean
	status?: number
	responseTime?: number
	error?: string
}

/**
 * Upstream HTTP health: the circuit-breaker state plus, when configured, a
 * GET against each `http.healthCheck.urls` entry.
 */
@Injectable()
export class HttpHealthIndicator extends BaseHealthIndicator {
	private readonly healthCheckUrls: readonly string[]
	private readonly timeout: number

	constructor(
		private readonly httpClient: HttpClientService,
		configService: ConfigService,
	) {
		super('http')
		const config = configService.get<HttpHealthCheckConfig>('http.healthCheck')
		this.healthCheckUrls = config.urls
		this.timeout = config.timeout
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		const stats = this.httpClient.getStats()
		const circuitBreakerOpen = this.httpClient.isCircuitOpen()
		const circuitBreaker = circuitBreakerOpen ? 'open' : 'closed'

		const checks = await Promise.all(this.healthCheckUrls.map(url => this.probe(url)))
		const successCount = checks.filter(check => check.success).length
		const isHealthy = successCount === checks.length && !circuitBreakerOpen

		if (!isHealthy) {
			const reason = checks.length > 0
				? `${successCount}/${checks.length} endpoints healthy, circuit breaker: ${circuitBreaker}`
				: 'Circuit breaker is open'
			CorrelatedLogger.warn(`HTTP health check failed: ${reason}`, HttpHealthIndicator.name)
			return this.createUnhealthyResult(reason, { circuitBreaker, checks, stats })
		}

		return this.createHealthyResult({ circuitBreaker, checks, stats })
	}

	private async probe(url: string): Promise<EndpointCheck> {
		const startTime = Date.now()
		try {
			const response = await this.httpClient.get(url, { timeout: this.timeout })
			return {
				url,
				status: response.status,
				responseTime: Date.now() - startTime,
				success: response.status >= 200 && response.status < 300,
			}
		}
		catch (error: unknown) {
			return { url, success: false, error: errorMessage(error) }
		}
	}

	protected getDescription(): string {
		return 'Monitors HTTP connection health including circuit breaker status and external endpoint connectivity'
	}
}
