import MediaStreamImageRESTController from '@microservice/API/Controller/MediaStreamImageRESTController'
import { CacheModule } from '@microservice/Cache/cache.module'
import { ConfigModule } from '@microservice/Config/config.module'
import { CorrelationModule } from '@microservice/Correlation/correlation.module'
import { CorrelationMiddleware } from '@microservice/Correlation/middleware/correlation.middleware'
import { TimingMiddleware } from '@microservice/Correlation/middleware/timing.middleware'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { MediaStreamExceptionFilter } from '@microservice/Error/MediaStreamExceptionFilter'
import { HealthModule } from '@microservice/Health/health.module'
import { HttpModule } from '@microservice/HTTP/http.module'
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob'
import WebpImageManipulationJob from '@microservice/Job/WebpImageManipulationJob'
import { MetricsModule } from '@microservice/Metrics/metrics.module'
import { MetricsMiddleware } from '@microservice/Metrics/middleware/metrics.middleware'
import { MonitoringModule } from '@microservice/Monitoring/monitoring.module'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import { QueueModule } from '@microservice/Queue/queue.module'
import { AdaptiveRateLimitGuard } from '@microservice/RateLimit/guards/adaptive-rate-limit.guard'
import { RateLimitModule } from '@microservice/RateLimit/rate-limit.module'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Rule/ValidateCacheImageRequestResizeTargetRule'
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule'
import { StorageModule } from '@microservice/Storage/storage.module'
import { TasksModule } from '@microservice/Tasks/tasks.module'
import { ValidationModule } from '@microservice/Validation/validation.module'
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, HttpAdapterHost } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'

const controllers = [MediaStreamImageRESTController]

const operations = [CacheImageResourceOperation]

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
		QueueModule,
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
