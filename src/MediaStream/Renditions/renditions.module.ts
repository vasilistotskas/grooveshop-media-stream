import { Module } from '@nestjs/common'
import { ApiModule } from '#microservice/API/api.module'
import { CacheOperationsModule } from '#microservice/Cache/cache-operations.module'
import { CacheModule } from '#microservice/Cache/cache.module'
import { ConfigModule } from '#microservice/Config/config.module'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import { StorageModule } from '#microservice/Storage/storage.module'
import { ValidationModule } from '#microservice/Validation/validation.module'
import { RenditionGeneratorService } from './services/rendition-generator.service.js'
import { RenditionSourceScanner } from './services/rendition-source-scanner.service.js'

/** Pre-generation of the renditions of every upload (see `RenditionGeneratorService`). */
@Module({
	imports: [
		ApiModule,
		CacheModule,
		CacheOperationsModule,
		ConfigModule,
		MetricsModule,
		StorageModule,
		ValidationModule,
	],
	providers: [
		RenditionGeneratorService,
		RenditionSourceScanner,
	],
})
export class RenditionsModule {}
