import { CacheModule } from '#microservice/Cache/cache.module'
import { ConfigModule } from '#microservice/Config/config.module'
import { HttpModule } from '#microservice/HTTP/http.module'
import { QueueModule } from '#microservice/Queue/queue.module'
import { StorageModule } from '#microservice/Storage/storage.module'
import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController } from './controllers/health.controller.js'
import { HealthDetailGuard } from './guards/health-detail.guard.js'
import { DiskSpaceHealthIndicator } from './indicators/disk-space-health.indicator.js'
import { MemoryHealthIndicator } from './indicators/memory-health.indicator.js'
import { SharpHealthIndicator } from './indicators/sharp-health.indicator.js'

@Module({
	imports: [
		TerminusModule,
		ConfigModule,
		HttpModule,
		CacheModule,
		QueueModule,
		StorageModule,
	],
	controllers: [HealthController],
	providers: [
		DiskSpaceHealthIndicator,
		MemoryHealthIndicator,
		SharpHealthIndicator,
		HealthDetailGuard,
	],
	exports: [
		DiskSpaceHealthIndicator,
		MemoryHealthIndicator,
		SharpHealthIndicator,
	],
})
export class HealthModule {}
