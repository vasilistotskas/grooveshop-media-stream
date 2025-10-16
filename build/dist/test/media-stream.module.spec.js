import MediaStreamImageRESTController from "../MediaStream/API/controllers/media-stream-image-rest.controller.js";
import CacheImageResourceOperation from "../MediaStream/Cache/operations/cache-image-resource.operation.js";
import MediaStreamModule from "../MediaStream/media-stream.module.js";
import FetchResourceResponseJob from "../MediaStream/Queue/jobs/fetch-resource-response.job.js";
import GenerateResourceIdentityFromRequestJob from "../MediaStream/Queue/jobs/generate-resource-identity-from-request.job.js";
import StoreResourceResponseToFileJob from "../MediaStream/Queue/jobs/store-resource-response-to-file.job.js";
import WebpImageManipulationJob from "../MediaStream/Queue/jobs/webp-image-manipulation.job.js";
import { TasksModule } from "../MediaStream/Tasks/tasks.module.js";
import ValidateCacheImageRequestResizeTargetRule from "../MediaStream/Validation/rules/validate-cache-image-request-resize-target.rule.js";
import ValidateCacheImageRequestRule from "../MediaStream/Validation/rules/validate-cache-image-request.rule.js";
import { HttpModule } from "@nestjs/axios";
import { ScheduleModule } from "@nestjs/schedule";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it } from "vitest";
describe('mediaStreamModule', ()=>{
    let module;
    beforeEach(async ()=>{
        module = await Test.createTestingModule({
            imports: [
                HttpModule,
                ScheduleModule.forRoot(),
                TasksModule,
                MediaStreamModule
            ]
        }).compile();
    });
    it('should compile the module', async ()=>{
        expect(module).toBeDefined();
        const mediaStreamModule = await module.resolve(MediaStreamModule);
        expect(mediaStreamModule).toBeDefined();
    });
    it('should have MediaStreamImageRESTController defined', async ()=>{
        const controller = await module.resolve(MediaStreamImageRESTController);
        expect(controller).toBeDefined();
    });
    it('should have CacheImageResourceOperation defined', async ()=>{
        const operation = await module.resolve(CacheImageResourceOperation);
        expect(operation).toBeDefined();
    });
    it('should have GenerateResourceIdentityFromRequestJob defined', async ()=>{
        const job = await module.resolve(GenerateResourceIdentityFromRequestJob);
        expect(job).toBeDefined();
    });
    it('should have FetchResourceResponseJob defined', async ()=>{
        const job = await module.resolve(FetchResourceResponseJob);
        expect(job).toBeDefined();
    });
    it('should have StoreResourceResponseToFileJob defined', async ()=>{
        const job = await module.resolve(StoreResourceResponseToFileJob);
        expect(job).toBeDefined();
    });
    it('should have WebpImageManipulationJob defined', async ()=>{
        const job = await module.resolve(WebpImageManipulationJob);
        expect(job).toBeDefined();
    });
    it('should have ValidateCacheImageRequestRule defined', async ()=>{
        const rule = await module.resolve(ValidateCacheImageRequestRule);
        expect(rule).toBeDefined();
    });
    it('should have ValidateCacheImageRequestResizeTargetRule defined', async ()=>{
        const rule = await module.resolve(ValidateCacheImageRequestResizeTargetRule);
        expect(rule).toBeDefined();
    });
    it('should import HttpModule', ()=>{
        const importedHttpModule = module.get(HttpModule);
        expect(importedHttpModule).toBeDefined();
    });
    it('should import ScheduleModule', ()=>{
        const importedScheduleModule = module.get(ScheduleModule);
        expect(importedScheduleModule).toBeDefined();
    });
    it('should import TasksModule', ()=>{
        const importedTasksModule = module.get(TasksModule);
        expect(importedTasksModule).toBeDefined();
    });
});

//# sourceMappingURL=media-stream.module.spec.js.map