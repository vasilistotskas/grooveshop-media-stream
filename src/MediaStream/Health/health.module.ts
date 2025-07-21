import { CacheModule } from '@microservice/Cache/cache.module'
import { ConfigModule } from '@microservice/Config/config.module'
import { HttpModule } from '@microservice/HTTP/http.module'
import { HttpHealthIndicator } from '@microservice/HTTP/indicators/http-health.indicator'
import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController } from './controllers/health.controller'
import { DiskSpaceHealthIndicator } from './indicators/disk-space-health.indicator'
import { MemoryHealthIndicator } from './indicators/memory-health.indicator'

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
