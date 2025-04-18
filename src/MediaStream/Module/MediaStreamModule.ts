import MediaStreamImageRESTController from '@microservice/API/Controller/MediaStreamImageRESTController'
import { MediaStreamExceptionFilter } from '@microservice/Error/MediaStreamExceptionFilter'
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob'
import WebpImageManipulationJob from '@microservice/Job/WebpImageManipulationJob'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Rule/ValidateCacheImageRequestResizeTargetRule'
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule'
import { TasksModule } from '@microservice/Tasks/tasks.module'
import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
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
	imports: [HttpModule, ScheduleModule.forRoot(), TasksModule],
	controllers,
	providers: [
		...jobs,
		...rules,
		...operations,
		{
			provide: APP_FILTER,
			useClass: MediaStreamExceptionFilter,
		},
	],
})
export default class MediaStreamModule {}
