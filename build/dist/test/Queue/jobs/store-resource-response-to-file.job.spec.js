import { open } from "node:fs/promises";
import UnableToStoreFetchedResourceException from "../../../MediaStream/API/exceptions/unable-to-store-fetched-resource.exception.js";
import StoreResourceResponseToFileJob from "../../../MediaStream/Queue/jobs/store-resource-response-to-file.job.js";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock('node:fs/promises');
describe('storeResourceResponseToFileJob', ()=>{
    let job;
    beforeEach(async ()=>{
        const module = await Test.createTestingModule({
            providers: [
                StoreResourceResponseToFileJob
            ]
        }).compile();
        job = await module.resolve(StoreResourceResponseToFileJob);
    });
    describe('handle', ()=>{
        it('should successfully store resource response to file', async ()=>{
            const mockFileHandle = {
                createWriteStream: vi.fn().mockReturnValue({
                    on: vi.fn().mockImplementation((event, callback)=>{
                        if (event === 'finish') {
                            callback();
                        }
                    })
                })
            };
            const mockResponse = {
                data: {
                    pipe: vi.fn()
                }
            };
            open.mockResolvedValue(mockFileHandle);
            await job.handle('test-resource', 'test/path', mockResponse);
            expect(open).toHaveBeenCalledWith('test/path', 'w');
            expect(mockResponse.data.pipe).toHaveBeenCalledWith(mockFileHandle.createWriteStream());
        });
        it('should throw UnableToStoreFetchedResourceException when response data is not streamable', async ()=>{
            const mockResponse = {
                data: null
            };
            await expect(job.handle('test-resource', 'test/path', mockResponse)).rejects.toThrow(UnableToStoreFetchedResourceException);
        });
        it('should throw UnableToStoreFetchedResourceException when response data has no pipe method', async ()=>{
            const mockResponse = {
                data: {}
            };
            await expect(job.handle('test-resource', 'test/path', mockResponse)).rejects.toThrow(UnableToStoreFetchedResourceException);
        });
        it('should throw UnableToStoreFetchedResourceException when file stream encounters an error', async ()=>{
            const mockFileHandle = {
                createWriteStream: vi.fn().mockReturnValue({
                    on: vi.fn().mockImplementation((event, callback)=>{
                        if (event === 'error') {
                            callback(new Error('Stream error'));
                        }
                    })
                })
            };
            const mockResponse = {
                data: {
                    pipe: vi.fn()
                }
            };
            open.mockResolvedValue(mockFileHandle);
            await expect(job.handle('test-resource', 'test/path', mockResponse)).rejects.toThrow(UnableToStoreFetchedResourceException);
        });
    });
});

//# sourceMappingURL=store-resource-response-to-file.job.spec.js.map