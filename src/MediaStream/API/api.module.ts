import { CacheOperationsModule } from '#microservice/Cache/cache-operations.module'
import { ConfigModule } from '#microservice/Config/config.module'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import { ValidationModule } from '#microservice/Validation/validation.module'
import { Module } from '@nestjs/common'
import { ImageStreamService } from './services/image-stream.service.js'
import { RequestValidatorService } from './services/request-validator.service.js'
import { UrlBuilderService } from './services/url-builder.service.js'

/**
 * API Module - Encapsulates all API-related services
 */
@Module({
	imports: [
		ConfigModule,
		CacheOperationsModule,
		MetricsModule,
		ValidationModule,
	],
	providers: [
		ImageStreamService,
		RequestValidatorService,
		UrlBuilderService,
	],
	exports: [
		ImageStreamService,
		RequestValidatorService,
		UrlBuilderService,
	],
})
export class ApiModule {}
