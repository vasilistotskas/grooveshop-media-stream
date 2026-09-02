import { Module } from '@nestjs/common'
import { ConfigModule } from '#microservice/Config/config.module'
import { CorrelationModule } from '#microservice/Correlation/correlation.module'
import { StorageHealthIndicator } from './indicators/storage-health.indicator.js'
import { StorageCleanupService } from './services/storage-cleanup.service.js'
import { StorageMonitoringService } from './services/storage-monitoring.service.js'

@Module({
	imports: [
		ConfigModule,
		CorrelationModule,
	],
	providers: [
		StorageMonitoringService,
		StorageCleanupService,
		StorageHealthIndicator,
	],
	exports: [
		StorageMonitoringService,
		StorageCleanupService,
		StorageHealthIndicator,
	],
})
export class StorageModule {}
