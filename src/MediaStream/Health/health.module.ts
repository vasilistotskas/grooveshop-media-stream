import { CacheModule } from '@microservice/Cache/cache.module'
import { ConfigModule } from '@microservice/Config/config.module'
import { HealthController } from '@microservice/Health/controllers/health.controller'
import { DiskSpaceHealthIndicator } from '@microservice/Health/indicators/disk-space-health.indicator'
import { MemoryHealthIndicator } from '@microservice/Health/indicators/memory-health.indicator'
import { HttpModule } from '@microservice/HTTP/http.module'
import { HttpHealthIndicator } from '@microservice/HTTP/indicators/http-health.indicator'
import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'

@Module({
	imports: [
		TerminusModule,
		ConfigModule,
		HttpModule,
		CacheModule,
	],
	controllers: [HealthController],
	providers: [
		DiskSpaceHealthIndicator,
		MemoryHealthIndicator,
		HttpHealthIndicator,
	],
	exports: [
		DiskSpaceHealthIndicator,
		MemoryHealthIndicator,
		HttpHealthIndicator,
	],
})
export class HealthModule {}
