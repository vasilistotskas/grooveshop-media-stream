import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob'
import WebpImageManipulationJob from '@microservice/Job/WebpImageManipulationJob'
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule'
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import MediaStreamImageRESTController from '@microservice/API/Controller/MediaStreamImageRESTController'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Rule/ValidateCacheImageRequestResizeTargetRule'
import { DevtoolsModule } from '@nestjs/devtools-integration'

const controllers = [MediaStreamImageRESTController]

const operations = [CacheImageResourceOperation]

const jobs = [
	GenerateResourceIdentityFromRequestJob,
	FetchResourceResponseJob,
	StoreResourceResponseToFileJob,
	WebpImageManipulationJob
]

const rules = [ValidateCacheImageRequestRule, ValidateCacheImageRequestResizeTargetRule]

@Module({
	imports: [
		DevtoolsModule.register({
			http: process.env.NODE_ENV !== 'production'
		}),
		HttpModule
	],
	controllers,
	providers: [...jobs, ...rules, ...operations]
})
export default class MediaStreamModule {}
