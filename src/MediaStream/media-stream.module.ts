import type { MiddlewareConsumer, NestModule } from '@nestjs/common'
import MediaStreamImageRESTController from '@microservice/API/controllers/media-stream-image-rest.controller'
import { CacheModule } from '@microservice/Cache/cache.module'
import CacheImageResourceOperation from '@microservice/Cache/operations/cache-image-resource.operation'
import { MediaStreamExceptionFilter } from '@microservice/common/filters/media-stream-exception.filter'
import { ConfigModule } from '@microservice/Config/config.module'
import { CorrelationModule } from '@microservice/Correlation/correlation.module'
import { CorrelationMiddleware } from '@microservice/Correlation/middleware/correlation.middleware'
import { TimingMiddleware } from '@microservice/Correlation/middleware/timing.middleware'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { HealthModule } from '@microservice/Health/health.module'
import { HttpModule } from '@microservice/HTTP/http.module'
import { MetricsModule } from '@microservice/Metrics/metrics.module'
import { MetricsMiddleware } from '@microservice/Metrics/middleware/metrics.middleware'
import { MonitoringModule } from '@microservice/Monitoring/monitoring.module'
import FetchResourceResponseJob from '@microservice/Queue/jobs/fetch-resource-response.job'
import GenerateResourceIdentityFromRequestJob from '@microservice/Queue/jobs/generate-resource-identity-from-request.job'
import StoreResourceResponseToFileJob from '@microservice/Queue/jobs/store-resource-response-to-file.job'
import WebpImageManipulationJob from '@microservice/Queue/jobs/webp-image-manipulation.job'
// import { QueueModule } from '@microservice/Queue/queue.module' // Disabled - Bull incompatible with Bun
// Import JobQueueManager from mock file to avoid loading Bull
import { JobQueueManager } from '@microservice/Queue/services/job-queue.manager.mock'
import { AdaptiveRateLimitGuard } from '@microservice/RateLimit/guards/adaptive-rate-limit.guard'
import { RateLimitModule } from '@microservice/RateLimit/rate-limit.module'
import { StorageModule } from '@microservice/Storage/storage.module'
import { TasksModule } from '@microservice/Tasks/tasks.module'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Validation/rules/validate-cache-image-request-resize-target.rule'
import ValidateCacheImageRequestRule from '@microservice/Validation/rules/validate-cache-image-request.rule'
import { ValidationModule } from '@microservice/Validation/validation.module'
import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, HttpAdapterHost } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'

const controllers = [MediaStreamImageRESTController]

const operations = [CacheImageResourceOperation]

// Jobs are kept as providers even though QueueModule is disabled
// They're used directly by CacheImageResourceOperation for synchronous processing
const jobs = [
	GenerateResourceIdentityFromRequestJob,
	FetchResourceResponseJob,
	StoreResourceResponseToFileJob,
	WebpImageManipulationJob,
]

const rules = [ValidateCacheImageRequestRule, ValidateCacheImageRequestResizeTargetRule]

/**
 * The Main module for the MediaStream application
 * Configures all controllers, providers, and global filters/interceptors
 */
@Module({
	imports: [
		ConfigModule,
		CacheModule,
		CorrelationModule,
		HealthModule,
		HttpModule,
		MetricsModule,
		MonitoringModule,
		// QueueModule, // Temporarily disabled - Bull has compatibility issues with Bun
		RateLimitModule,
		StorageModule,
		TasksModule,
		ValidationModule,
		ScheduleModule.forRoot(),
	],
	controllers,
	providers: [
		...jobs,
		...rules,
		...operations,
		// JobQueueManager is actually MockJobQueueManager (imported from mock file)
		JobQueueManager,
		{
			provide: APP_FILTER,
			useFactory: (httpAdapterHost: HttpAdapterHost, _correlationService: CorrelationService) => {
				return new MediaStreamExceptionFilter(httpAdapterHost, _correlationService)
			},
			inject: [HttpAdapterHost, CorrelationService],
		},
		{
			provide: APP_GUARD,
			useClass: AdaptiveRateLimitGuard,
		},
	],
})
export default class MediaStreamModule implements NestModule {
	configure(consumer: MiddlewareConsumer): void {
		consumer
			.apply(CorrelationMiddleware, TimingMiddleware, MetricsMiddleware)
			.forRoutes('*')
	}
}
