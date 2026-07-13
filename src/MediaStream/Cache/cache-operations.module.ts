import { Module } from '@nestjs/common'
import { ConfigModule } from '#microservice/Config/config.module'
import { HttpModule } from '#microservice/HTTP/http.module'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import FetchResourceResponseJob from '#microservice/Processing/jobs/fetch-resource-response.job'
import GenerateResourceIdentityFromRequestJob from '#microservice/Processing/jobs/generate-resource-identity-from-request.job'
import StoreResourceResponseToFileJob from '#microservice/Processing/jobs/store-resource-response-to-file.job'
import WebpImageManipulationJob from '#microservice/Processing/jobs/webp-image-manipulation.job'
import { SharpConfigService } from '#microservice/Processing/services/sharp-config.service'
import ValidateCacheImageRequestResizeTargetRule from '#microservice/Validation/rules/validate-cache-image-request-resize-target.rule'
import ValidateCacheImageRequestRule from '#microservice/Validation/rules/validate-cache-image-request.rule'
import { ValidationModule } from '#microservice/Validation/validation.module'
import { CacheModule } from './cache.module.js'
import CacheImageResourceOperation from './operations/cache-image-resource.operation.js'
import { ImageFormatProcessor } from './operations/image-format-processor.service.js'
import { ResourceFetcher } from './operations/resource-fetcher.service.js'

/**
 * Shared module for cache operations
 * Provides CacheImageResourceOperation with all its dependencies
 */
@Module({
	imports: [
		CacheModule,
		ConfigModule,
		HttpModule,
		ValidationModule,
		MetricsModule,
	],
	providers: [
		CacheImageResourceOperation,
		ResourceFetcher,
		ImageFormatProcessor,
		ValidateCacheImageRequestRule,
		ValidateCacheImageRequestResizeTargetRule,
		GenerateResourceIdentityFromRequestJob,
		FetchResourceResponseJob,
		StoreResourceResponseToFileJob,
		WebpImageManipulationJob,
		SharpConfigService,
	],
	exports: [
		CacheImageResourceOperation,
	],
})
export class CacheOperationsModule {}
