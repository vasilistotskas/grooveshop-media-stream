import CacheImageRequest, { ResizeOptions } from "../../../MediaStream/API/dto/cache-image-request.dto.js";
import FetchResourceResponseJob from "../../../MediaStream/Queue/jobs/fetch-resource-response.job.js";
import { HttpService } from "@nestjs/axios";
import { Test } from "@nestjs/testing";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
describe('fetchResourceResponseJob', ()=>{
    let job;
    let httpService;
    beforeEach(async ()=>{
        const module = await Test.createTestingModule({
            providers: [
                FetchResourceResponseJob,
                {
                    provide: HttpService,
                    useValue: {
                        axiosRef: vi.fn()
                    }
                }
            ]
        }).compile();
        job = await module.resolve(FetchResourceResponseJob);
        httpService = module.get(HttpService);
    });
    describe('handle', ()=>{
        it('should successfully fetch resource response', async ()=>{
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {},
                data: {}
            };
            const request = new CacheImageRequest({
                resourceTarget: 'http://example.com/image.jpg',
                resizeOptions: new ResizeOptions()
            });
            const mockAxiosRef = vi.fn().mockResolvedValue(mockResponse);
            Object.defineProperty(httpService, 'axiosRef', {
                value: mockAxiosRef
            });
            const result = await job.handle(request);
            expect(mockAxiosRef).toHaveBeenCalledWith({
                url: request.resourceTarget,
                method: 'GET',
                responseType: 'stream'
            });
            expect(result).toEqual(mockResponse);
        });
        it('should handle error and return 404 response', async ()=>{
            const mockError = new AxiosError('Network error');
            mockError.config = {
                headers: new AxiosHeaders()
            };
            const request = new CacheImageRequest({
                resourceTarget: 'http://example.com/image.jpg',
                resizeOptions: new ResizeOptions()
            });
            const mockAxiosRef = vi.fn().mockRejectedValue(mockError);
            Object.defineProperty(httpService, 'axiosRef', {
                value: mockAxiosRef
            });
            const result = await job.handle(request);
            expect(result).toEqual({
                status: 404,
                statusText: 'Bad Request',
                headers: {},
                config: mockError.config,
                data: null
            });
        });
    });
});

//# sourceMappingURL=fetch-resource-response.job.spec.js.map