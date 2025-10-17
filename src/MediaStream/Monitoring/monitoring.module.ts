import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TerminusModule } from '@nestjs/terminus'
import { CorrelationModule } from '../Correlation/correlation.module.js'
import { MetricsModule } from '../Metrics/metrics.module.js'
import { MonitoringController } from './controllers/monitoring.controller.js'
import { AlertingHealthIndicator } from './indicators/alerting-health.indicator.js'
import { SystemHealthIndicator } from './indicators/system-health.indicator.js'
import { AlertService } from './services/alert.service.js'
import { MonitoringService } from './services/monitoring.service.js'
import { PerformanceMonitoringService } from './services/performance-monitoring.service.js'

@Module({
	imports: [
		ConfigModule,
		CorrelationModule,
		MetricsModule,
		TerminusModule,
	],
	providers: [
		MonitoringService,
		AlertService,
		PerformanceMonitoringService,
		SystemHealthIndicator,
		AlertingHealthIndicator,
	],
	controllers: [
		MonitoringController,
	],
	exports: [
		MonitoringService,
		AlertService,
		PerformanceMonitoringService,
	],
})
export class MonitoringModule {}
