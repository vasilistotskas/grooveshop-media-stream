import { ConfigService } from '@microservice/Config/config.service'
import { Controller, Get, Header } from '@nestjs/common'
import { MetricsService } from '../services/metrics.service'

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
	async getMetricsJson() {
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
