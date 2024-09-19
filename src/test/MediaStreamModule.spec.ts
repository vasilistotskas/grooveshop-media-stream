import MediaStreamImageRESTController from '@microservice/API/Controller/MediaStreamImageRESTController'
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob'
import WebpImageManipulationJob from '@microservice/Job/WebpImageManipulationJob'
import MediaStreamModule from '@microservice/Module/MediaStreamModule'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Rule/ValidateCacheImageRequestResizeTargetRule'
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule'
import { TasksModule } from '@microservice/Tasks/tasks.module'
import { HttpModule } from '@nestjs/axios'
import { ScheduleModule } from '@nestjs/schedule'
import { Test, TestingModule } from '@nestjs/testing'

describe('mediaStreamModule', () => {
	let module: TestingModule

	beforeEach(async () => {
		module = await Test.createTestingModule({
			imports: [HttpModule, ScheduleModule.forRoot(), TasksModule, MediaStreamModule],
		}).compile()
	})

	it('should compile the module', async () => {
		expect(module).toBeDefined()
		const mediaStreamModule = await module.resolve<MediaStreamModule>(MediaStreamModule)
		expect(mediaStreamModule).toBeDefined()
	})

	it('should have MediaStreamImageRESTController defined', async () => {
		const controller = await module.resolve<MediaStreamImageRESTController>(MediaStreamImageRESTController)
		expect(controller).toBeDefined()
	})

	it('should have CacheImageResourceOperation defined', async () => {
		const operation = await module.resolve<CacheImageResourceOperation>(CacheImageResourceOperation)
		expect(operation).toBeDefined()
	})

	it('should have GenerateResourceIdentityFromRequestJob defined', async () => {
		const job = await module.resolve<GenerateResourceIdentityFromRequestJob>(GenerateResourceIdentityFromRequestJob)
		expect(job).toBeDefined()
	})

	it('should have FetchResourceResponseJob defined', async () => {
		const job = await module.resolve<FetchResourceResponseJob>(FetchResourceResponseJob)
		expect(job).toBeDefined()
	})

	it('should have StoreResourceResponseToFileJob defined', async () => {
		const job = await module.resolve<StoreResourceResponseToFileJob>(StoreResourceResponseToFileJob)
		expect(job).toBeDefined()
	})

	it('should have WebpImageManipulationJob defined', async () => {
		const job = await module.resolve<WebpImageManipulationJob>(WebpImageManipulationJob)
		expect(job).toBeDefined()
	})

	it('should have ValidateCacheImageRequestRule defined', async () => {
		const rule = await module.resolve<ValidateCacheImageRequestRule>(ValidateCacheImageRequestRule)
		expect(rule).toBeDefined()
	})

	it('should have ValidateCacheImageRequestResizeTargetRule defined', async () => {
		const rule = await module.resolve<ValidateCacheImageRequestResizeTargetRule>(ValidateCacheImageRequestResizeTargetRule)
		expect(rule).toBeDefined()
	})

	it('should import HttpModule', () => {
		const importedHttpModule = module.get<HttpModule>(HttpModule)
		expect(importedHttpModule).toBeDefined()
	})

	it('should import ScheduleModule', () => {
		const importedScheduleModule = module.get(ScheduleModule)
		expect(importedScheduleModule).toBeDefined()
	})

	it('should import TasksModule', () => {
		const importedTasksModule = module.get<TasksModule>(TasksModule)
		expect(importedTasksModule).toBeDefined()
	})
})
