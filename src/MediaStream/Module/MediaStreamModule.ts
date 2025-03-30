import MediaStreamImageRESTController from '@microservice/API/Controller/MediaStreamImageRESTController'
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob'
import WebpImageManipulationJob from '@microservice/Job/WebpImageManipulationJob'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Rule/ValidateCacheImageRequestResizeTargetRule'
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule'
import { TasksModule } from '@microservice/Tasks/tasks.module'
import { HttpModule } from '@nestjs/axios'
import { Logger, Module } from '@nestjs/common'
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

@Module({
	imports: [HttpModule, ScheduleModule.forRoot(), TasksModule],
	controllers,
	providers: [...jobs, ...rules, ...operations, Logger],
})
export default class MediaStreamModule {}
