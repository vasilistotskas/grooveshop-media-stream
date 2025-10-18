import { HttpModule } from '#microservice/HTTP/http.module'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import FetchResourceResponseJob from '#microservice/Queue/jobs/fetch-resource-response.job'
import GenerateResourceIdentityFromRequestJob from '#microservice/Queue/jobs/generate-resource-identity-from-request.job'
import StoreResourceResponseToFileJob from '#microservice/Queue/jobs/store-resource-response-to-file.job'
import WebpImageManipulationJob from '#microservice/Queue/jobs/webp-image-manipulation.job'
import { QueueModule } from '#microservice/Queue/queue.module'
import ValidateCacheImageRequestResizeTargetRule from '#microservice/Validation/rules/validate-cache-image-request-resize-target.rule'
import ValidateCacheImageRequestRule from '#microservice/Validation/rules/validate-cache-image-request.rule'
import { ValidationModule } from '#microservice/Validation/validation.module'
import { Module } from '@nestjs/common'
import { CacheModule } from './cache.module.js'
import CacheImageResourceOperation from './operations/cache-image-resource.operation.js'

/**
 * Shared module for cache operations
 * Provides CacheImageResourceOperation with all its dependencies
 */
@Module({
	imports: [
		CacheModule,
		HttpModule,
		QueueModule,
		ValidationModule,
		MetricsModule,
	],
	providers: [
		CacheImageResourceOperation,
		ValidateCacheImageRequestRule,
		ValidateCacheImageRequestResizeTargetRule,
		GenerateResourceIdentityFromRequestJob,
		FetchResourceResponseJob,
		StoreResourceResponseToFileJob,
		WebpImageManipulationJob,
	],
	exports: [
		CacheImageResourceOperation,
	],
})
export class CacheOperationsModule {}
