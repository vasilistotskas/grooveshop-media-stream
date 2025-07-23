import { ConfigService } from '@microservice/Config/config.service'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { Controller, Get, Header } from '@nestjs/common'

@Controller()
export class MetricsController {
	constructor(
		private readonly metricsService: MetricsService,
		private readonly configService: ConfigService,
	) {}

	@Get('metrics')
	@Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
	async getMetrics(): Promise<string> {
		if (!this.configService.get('monitoring.enabled')) {
			return '# Metrics collection is disabled\n'
		}

		return this.metricsService.getMetrics()
	}

	@Get('metrics/json')
	async getMetricsJson(): Promise<{ error: string, timestamp?: undefined, metrics?: undefined, registry?: undefined, format?: undefined } | { timestamp: string, metrics: string, registry: string, format: string, error?: undefined }> {
		if (!this.configService.get('monitoring.enabled')) {
			return { error: 'Metrics collection is disabled' }
		}

		const metricsText = await this.metricsService.getMetrics()

		return {
			timestamp: new Date().toISOString(),
			metrics: metricsText,
			registry: 'prometheus',
			format: 'text/plain',
		}
	}
}
