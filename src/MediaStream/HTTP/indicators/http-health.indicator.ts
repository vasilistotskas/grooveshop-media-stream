import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator'
import { Injectable } from '@nestjs/common'
import { HealthIndicatorResult } from '@nestjs/terminus'
import { HttpClientService } from '../services/http-client.service'

@Injectable()
export class HttpHealthIndicator extends BaseHealthIndicator {
	private readonly healthCheckUrls: string[]
	private readonly timeout: number

	constructor(
		private readonly httpClient: HttpClientService,
		private readonly _configService: ConfigService,
	) {
		super('http')
		this.healthCheckUrls = this._configService.getOptional('http.healthCheck.urls', [])
		this.timeout = this._configService.getOptional('http.healthCheck.timeout', 5000)
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		const stats = this.httpClient.getStats()
		const circuitBreakerOpen = this.httpClient.isCircuitOpen()

		// If no health check URLs are configured, just check the circuit breaker
		if (!this.healthCheckUrls || this.healthCheckUrls.length === 0) {
			if (circuitBreakerOpen) {
				return this.createUnhealthyResult('Circuit breaker is open', {
					circuitBreaker: 'open',
					checks: [],
					stats,
				})
			}
			return this.createHealthyResult({
				circuitBreaker: 'closed',
				checks: [],
				stats,
			})
		}

		try {
			// Check all configured health check URLs
			const results = await Promise.allSettled(
				this.healthCheckUrls.map(async (url) => {
					try {
						const startTime = Date.now()
						const response = await this.httpClient.get(url, { timeout: this.timeout })
						const responseTime = Date.now() - startTime

						return {
							url,
							status: response.status,
							responseTime,
							success: response.status >= 200 && response.status < 300,
						}
					}
					catch (error: unknown) {
						return {
							url,
							error: (error as Error).message,
							success: false,
						}
					}
				}),
			)

			// Process results
			const checks = results.map((result) => {
				if (result.status === 'fulfilled') {
					return result.value
				}
				else {
					return {
						url: 'unknown',
						error: result.reason.message,
						success: false,
					}
				}
			})

			const successCount = checks.filter(check => check.success).length
			const isHealthy = successCount === checks.length && !circuitBreakerOpen

			if (!isHealthy) {
				CorrelatedLogger.warn(
					`HTTP health check failed: ${successCount}/${checks.length} endpoints healthy, circuit breaker: ${circuitBreakerOpen}`,
					HttpHealthIndicator.name,
				)
			}

			if (!isHealthy) {
				return this.createUnhealthyResult(`${successCount}/${checks.length} endpoints healthy, circuit breaker: ${circuitBreakerOpen}`, {
					circuitBreaker: circuitBreakerOpen ? 'open' : 'closed',
					checks,
					stats,
				})
			}

			return this.createHealthyResult({
				circuitBreaker: circuitBreakerOpen ? 'open' : 'closed',
				checks,
				stats,
			})
		}
		catch (error: unknown) {
			CorrelatedLogger.error(
				`HTTP health check error: ${(error as Error).message}`,
				(error as Error).stack,
				HttpHealthIndicator.name,
			)

			return this.createUnhealthyResult((error as Error).message, {
				circuitBreaker: circuitBreakerOpen ? 'open' : 'closed',
				checks: [{
					url: 'unknown',
					error: (error as Error).message,
					success: false,
				}],
				stats,
			})
		}
	}

	protected getDescription(): string {
		return 'Monitors HTTP connection health including circuit breaker status and external endpoint connectivity'
	}
}
