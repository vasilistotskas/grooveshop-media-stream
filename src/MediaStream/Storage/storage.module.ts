import { ConfigModule } from '#microservice/Config/config.module'
import { CorrelationModule } from '#microservice/Correlation/correlation.module'
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

import { StorageHealthIndicator } from './indicators/storage-health.indicator.js'
import { IntelligentEvictionService } from './services/intelligent-eviction.service.js'
import { StorageCleanupService } from './services/storage-cleanup.service.js'
import { StorageMonitoringService } from './services/storage-monitoring.service.js'

import { StorageOptimizationService } from './services/storage-optimization.service.js'

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
