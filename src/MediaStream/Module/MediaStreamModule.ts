import MediaStreamImageRESTController from '@microservice/API/Controller/MediaStreamImageRESTController'
import { CacheModule } from '@microservice/Cache/cache.module'
import { ConfigModule } from '@microservice/Config/config.module'
import { CorrelationModule } from '@microservice/Correlation/correlation.module'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { MediaStreamExceptionFilter } from '@microservice/Error/MediaStreamExceptionFilter'
import { HealthModule } from '@microservice/Health/health.module'
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob'
import WebpImageManipulationJob from '@microservice/Job/WebpImageManipulationJob'
import { MetricsModule } from '@microservice/Metrics/metrics.module'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Rule/ValidateCacheImageRequestResizeTargetRule'
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule'
import { TasksModule } from '@microservice/Tasks/tasks.module'
import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core'

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
	imports: [ConfigModule, CacheModule, CorrelationModule, HealthModule, MetricsModule, HttpModule, ScheduleModule.forRoot(), TasksModule],
	controllers,
	providers: [
		...jobs,
		...rules,
		...operations,
		{
			provide: APP_FILTER,
			useFactory: (httpAdapterHost: HttpAdapterHost, correlationService: CorrelationService) => {
				return new MediaStreamExceptionFilter(httpAdapterHost, correlationService)
			},
			inject: [HttpAdapterHost, CorrelationService],
		},
	],
})
export default class MediaStreamModule {}
