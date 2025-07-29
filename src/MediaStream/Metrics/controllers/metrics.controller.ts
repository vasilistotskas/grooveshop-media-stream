import { Controller, Get, Header, HttpCode, HttpStatus } from '@nestjs/common'
import { MetricsService } from '../services/metrics.service'

@Controller('metrics')
export class MetricsController {
	constructor(private readonly metricsService: MetricsService) {}

	/**
	 * Prometheus metrics endpoint
	 * Returns metrics in Prometheus format for scraping
	 */
	@Get()
	@HttpCode(HttpStatus.OK)
	@Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
	async getMetrics(): Promise<string> {
		return await this.metricsService.getMetrics()
	}

	/**
	 * Health check for metrics endpoint
	 */
	@Get('health')
	@HttpCode(HttpStatus.OK)
	getMetricsHealth(): { status: string, timestamp: number, service: string, registry: { metricsCount: number } } {
		return {
			status: 'healthy',
			timestamp: Date.now(),
			service: 'metrics',
			registry: {
				metricsCount: this.metricsService.getRegistry().getMetricsAsArray().length,
			},
		}
	}
}
