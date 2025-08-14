import { ConfigModule } from '@microservice/Config/config.module'
import { CorrelationModule } from '@microservice/Correlation/correlation.module'
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

import { StorageHealthIndicator } from './indicators/storage-health.indicator'
import { IntelligentEvictionService } from './services/intelligent-eviction.service'
import { StorageCleanupService } from './services/storage-cleanup.service'
import { StorageMonitoringService } from './services/storage-monitoring.service'

import { StorageOptimizationService } from './services/storage-optimization.service'

@Module({
	imports: [
		ConfigModule,
		CorrelationModule,
		ScheduleModule.forRoot(),
	],
	providers: [
		StorageMonitoringService,
		IntelligentEvictionService,
		StorageCleanupService,
		StorageOptimizationService,
		StorageHealthIndicator,
	],
	exports: [
		StorageMonitoringService,
		IntelligentEvictionService,
		StorageCleanupService,
		StorageOptimizationService,
		StorageHealthIndicator,
	],
})
export class StorageModule {}
