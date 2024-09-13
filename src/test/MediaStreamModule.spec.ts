import type { TestingModule } from '@nestjs/testing'
import MediaStreamImageRESTController from '@microservice/API/Controller/MediaStreamImageRESTController'
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob'
import WebpImageManipulationJob from '@microservice/Job/WebpImageManipulationJob'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Rule/ValidateCacheImageRequestResizeTargetRule'
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule'
import { HttpService } from '@nestjs/axios'
import { Test } from '@nestjs/testing'

describe('mediaStreamModule', () => {
	let module: TestingModule
	let controller: MediaStreamImageRESTController

	beforeEach(async () => {
		module = await Test.createTestingModule({
			controllers: [MediaStreamImageRESTController],
			providers: [
				{ provide: HttpService, useValue: {} },
				GenerateResourceIdentityFromRequestJob,
				CacheImageResourceOperation,
				FetchResourceResponseJob,
				WebpImageManipulationJob,
				StoreResourceResponseToFileJob,
				ValidateCacheImageRequestRule,
				ValidateCacheImageRequestResizeTargetRule,
			],
		}).compile()

		controller = await module.resolve<MediaStreamImageRESTController>(MediaStreamImageRESTController)
	})

	it('should be defined', () => {
		expect(controller).toBeDefined()
	})
})
