import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TerminusModule } from '@nestjs/terminus'
import { CorrelationModule } from '../Correlation/correlation.module'
import { MetricsModule } from '../Metrics/metrics.module'
import { MonitoringController } from './controllers/monitoring.controller'
import { AlertingHealthIndicator } from './indicators/alerting-health.indicator'
import { SystemHealthIndicator } from './indicators/system-health.indicator'
import { AlertService } from './services/alert.service'
import { MonitoringService } from './services/monitoring.service'
import { PerformanceMonitoringService } from './services/performance-monitoring.service'

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
