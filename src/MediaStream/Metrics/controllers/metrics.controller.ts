import { Controller, Get, Header, HttpCode, HttpStatus, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '#microservice/common/guards/internal-secret.guard'
import { MetricsService } from '../services/metrics.service.js'

@Controller('metrics')
@UseGuards(InternalSecretGuard)
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
}
