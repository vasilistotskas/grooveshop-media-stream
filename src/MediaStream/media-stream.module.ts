import type { MiddlewareConsumer, NestModule } from '@nestjs/common'
import { ApiModule } from '#microservice/API/api.module'
import { ConfigController } from '#microservice/API/controllers/config.controller'
import MediaStreamImageController from '#microservice/API/controllers/media-stream-image.controller'
import { CacheOperationsModule } from '#microservice/Cache/cache-operations.module'
import { CacheModule } from '#microservice/Cache/cache.module'
import { MediaStreamExceptionFilter } from '#microservice/common/filters/media-stream-exception.filter'
import { ConfigModule } from '#microservice/Config/config.module'
import { CorrelationModule } from '#microservice/Correlation/correlation.module'
import { CorrelationMiddleware } from '#microservice/Correlation/middleware/correlation.middleware'
import { TimingMiddleware } from '#microservice/Correlation/middleware/timing.middleware'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import { HealthModule } from '#microservice/Health/health.module'
import { HttpModule } from '#microservice/HTTP/http.module'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import { MetricsMiddleware } from '#microservice/Metrics/middleware/metrics.middleware'
import { MonitoringModule } from '#microservice/Monitoring/monitoring.module'
import { QueueModule } from '#microservice/Queue/queue.module'
import { AdaptiveRateLimitGuard } from '#microservice/RateLimit/guards/adaptive-rate-limit.guard'
import { RateLimitModule } from '#microservice/RateLimit/rate-limit.module'
import { StorageModule } from '#microservice/Storage/storage.module'
import { TasksModule } from '#microservice/Tasks/tasks.module'
import { ValidationModule } from '#microservice/Validation/validation.module'
import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, HttpAdapterHost } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'

const controllers = [MediaStreamImageController, ConfigController]

/**
 * The Main module for the MediaStream application
 * Configures all controllers, providers, and global filters/interceptors
 */
@Module({
	imports: [
		ApiModule,
		ConfigModule,
		CacheModule,
		CacheOperationsModule,
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
