import { CacheModule } from '#microservice/Cache/cache.module'
import { CacheHealthIndicator } from '#microservice/Cache/indicators/cache-health.indicator'
import { RedisHealthIndicator } from '#microservice/Cache/indicators/redis-health.indicator'
import { ConfigModule } from '#microservice/Config/config.module'
import { HttpModule } from '#microservice/HTTP/http.module'
import { HttpHealthIndicator } from '#microservice/HTTP/indicators/http-health.indicator'
import { AlertingHealthIndicator } from '#microservice/Monitoring/indicators/alerting-health.indicator'
import { SystemHealthIndicator } from '#microservice/Monitoring/indicators/system-health.indicator'
import { MonitoringModule } from '#microservice/Monitoring/monitoring.module'
import { JobQueueHealthIndicator } from '#microservice/Queue/indicators/job-queue-health.indicator'
import { QueueModule } from '#microservice/Queue/queue.module'
import { StorageHealthIndicator } from '#microservice/Storage/indicators/storage-health.indicator'
import { StorageModule } from '#microservice/Storage/storage.module'
import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController } from './controllers/health.controller.js'
import { DiskSpaceHealthIndicator } from './indicators/disk-space-health.indicator.js'
import { MemoryHealthIndicator } from './indicators/memory-health.indicator.js'
import { SharpHealthIndicator } from './indicators/sharp-health.indicator.js'

@Module({
	imports: [
		TerminusModule,
		ConfigModule,
		HttpModule,
		CacheModule,
		MonitoringModule,
		QueueModule,
		StorageModule,
	],
	controllers: [HealthController],
	providers: [
		DiskSpaceHealthIndicator,
		MemoryHealthIndicator,
		HttpHealthIndicator,
		CacheHealthIndicator,
		RedisHealthIndicator,
		AlertingHealthIndicator,
		SystemHealthIndicator,
		JobQueueHealthIndicator,
		StorageHealthIndicator,
		SharpHealthIndicator,
	],
	exports: [
		DiskSpaceHealthIndicator,
		MemoryHealthIndicator,
		HttpHealthIndicator,
		CacheHealthIndicator,
		RedisHealthIndicator,
		AlertingHealthIndicator,
		SystemHealthIndicator,
		JobQueueHealthIndicator,
		StorageHealthIndicator,
		SharpHealthIndicator,
	],
})
export class HealthModule {}
