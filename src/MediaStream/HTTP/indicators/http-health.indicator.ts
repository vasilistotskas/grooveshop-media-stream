import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { Injectable } from '@nestjs/common'
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus'
import { HttpClientService } from '../services/http-client.service'

@Injectable()
export class HttpHealthIndicator extends HealthIndicator {
	private readonly healthCheckUrls: string[]
	private readonly timeout: number

	constructor(
		private readonly httpClient: HttpClientService,
		private readonly configService: ConfigService,
	) {
		super()
		this.healthCheckUrls = this.configService.getOptional('http.healthCheck.urls', [])
		this.timeout = this.configService.getOptional('http.healthCheck.timeout', 5000)
	}

	async isHealthy(key: string): Promise<HealthIndicatorResult> {
		const stats = this.httpClient.getStats()
		const circuitBreakerOpen = this.httpClient.isCircuitOpen()

		// If no health check URLs are configured, just check the circuit breaker
		if (!this.healthCheckUrls || this.healthCheckUrls.length === 0) {
			return this.getStatus(key, !circuitBreakerOpen, {
				circuitBreaker: circuitBreakerOpen ? 'open' : 'closed',
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
					catch (error) {
						return {
							url,
							error: error.message,
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
						error: result.reason.message,
						success: false,
					}
				}
			})

			const successCount = checks.filter(check => check.success).length
			const isHealthy = successCount === checks.length && !circuitBreakerOpen

			if (!isHealthy) {
				CorrelatedLogger.warn(
					`HTTP health check failed: ${successCount}/${checks.length} endpoints healthy`,
					HttpHealthIndicator.name,
				)
			}

			return this.getStatus(key, isHealthy, {
				circuitBreaker: circuitBreakerOpen ? 'open' : 'closed',
				checks,
				stats,
			})
		}
		catch (error) {
			CorrelatedLogger.error(
				`HTTP health check error: ${error.message}`,
				error.stack,
				HttpHealthIndicator.name,
			)

			return this.getStatus(key, false, {
				error: error.message,
				circuitBreaker: circuitBreakerOpen ? 'open' : 'closed',
				stats,
			})
		}
	}

	getDetails(): Record<string, any> {
		return {
			name: 'HTTP Health Indicator',
			description: 'Monitors HTTP connection health',
			checks: [
				'Circuit breaker status',
				'External endpoint connectivity',
				'Response times',
				'Success rates',
			],
		}
	}
}
