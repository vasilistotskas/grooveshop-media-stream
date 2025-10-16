import MediaStreamImageRESTController from '@microservice/API/controllers/media-stream-image-rest.controller'
import CacheImageResourceOperation from '@microservice/Cache/operations/cache-image-resource.operation'
import MediaStreamModule from '@microservice/media-stream.module'
import FetchResourceResponseJob from '@microservice/Queue/jobs/fetch-resource-response.job'
import GenerateResourceIdentityFromRequestJob from '@microservice/Queue/jobs/generate-resource-identity-from-request.job'
import StoreResourceResponseToFileJob from '@microservice/Queue/jobs/store-resource-response-to-file.job'
import WebpImageManipulationJob from '@microservice/Queue/jobs/webp-image-manipulation.job'
import { TasksModule } from '@microservice/Tasks/tasks.module'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Validation/rules/validate-cache-image-request-resize-target.rule'
import ValidateCacheImageRequestRule from '@microservice/Validation/rules/validate-cache-image-request.rule'
import { HttpModule } from '@nestjs/axios'
import { ScheduleModule } from '@nestjs/schedule'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it } from 'vitest'

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
