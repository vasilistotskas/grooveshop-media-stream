import { CacheModule } from '@microservice/Cache/cache.module'
import { CacheHealthIndicator } from '@microservice/Cache/indicators/cache-health.indicator'
import { RedisHealthIndicator } from '@microservice/Cache/indicators/redis-health.indicator'
import { ConfigModule } from '@microservice/Config/config.module'
import { HealthController } from '@microservice/Health/controllers/health.controller'
import { DiskSpaceHealthIndicator } from '@microservice/Health/indicators/disk-space-health.indicator'
import { MemoryHealthIndicator } from '@microservice/Health/indicators/memory-health.indicator'
import { HttpModule } from '@microservice/HTTP/http.module'
import { HttpHealthIndicator } from '@microservice/HTTP/indicators/http-health.indicator'
import { AlertingHealthIndicator } from '@microservice/Monitoring/indicators/alerting-health.indicator'
import { SystemHealthIndicator } from '@microservice/Monitoring/indicators/system-health.indicator'
import { MonitoringModule } from '@microservice/Monitoring/monitoring.module'
// import { QueueModule } from '@microservice/Queue/queue.module' // Disabled - Bull incompatible with Bun
import { StorageHealthIndicator } from '@microservice/Storage/indicators/storage-health.indicator'
import { StorageModule } from '@microservice/Storage/storage.module'
import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'

@Module({
	imports: [
		TerminusModule,
		ConfigModule,
		HttpModule,
		CacheModule,
		MonitoringModule,
		// QueueModule, // Disabled - Bull incompatible with Bun
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
		// JobQueueHealthIndicator, // Disabled - depends on QueueModule which uses Bull
		StorageHealthIndicator,
	],
	exports: [
		DiskSpaceHealthIndicator,
		MemoryHealthIndicator,
		HttpHealthIndicator,
		CacheHealthIndicator,
		RedisHealthIndicator,
		AlertingHealthIndicator,
		SystemHealthIndicator,
		// JobQueueHealthIndicator, // Disabled - depends on QueueModule which uses Bull
		StorageHealthIndicator,
	],
})
export class HealthModule {}
