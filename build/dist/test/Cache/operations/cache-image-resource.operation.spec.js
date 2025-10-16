import { Buffer } from "node:buffer";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import CacheImageRequest, { BackgroundOptions, FitOptions, PositionOptions, ResizeOptions, SupportedResizeFormats } from "../../../MediaStream/API/dto/cache-image-request.dto.js";
import CacheImageResourceOperation from "../../../MediaStream/Cache/operations/cache-image-resource.operation.js";
import { MultiLayerCacheManager } from "../../../MediaStream/Cache/services/multi-layer-cache.manager.js";
import ResourceMetaData from "../../../MediaStream/HTTP/dto/resource-meta-data.dto.js";
import { MetricsService } from "../../../MediaStream/Metrics/services/metrics.service.js";
import FetchResourceResponseJob from "../../../MediaStream/Queue/jobs/fetch-resource-response.job.js";
import GenerateResourceIdentityFromRequestJob from "../../../MediaStream/Queue/jobs/generate-resource-identity-from-request.job.js";
import StoreResourceResponseToFileJob from "../../../MediaStream/Queue/jobs/store-resource-response-to-file.job.js";
import WebpImageManipulationJob from "../../../MediaStream/Queue/jobs/webp-image-manipulation.job.js";
import { JobQueueManager } from "../../../MediaStream/Queue/services/job-queue.manager.js";
import ValidateCacheImageRequestResizeTargetRule from "../../../MediaStream/Validation/rules/validate-cache-image-request-resize-target.rule.js";
import ValidateCacheImageRequestRule from "../../../MediaStream/Validation/rules/validate-cache-image-request.rule.js";
import { InputSanitizationService } from "../../../MediaStream/Validation/services/input-sanitization.service.js";
import { HttpService } from "@nestjs/axios";
import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock('node:fs/promises');
vi.mock('node:process', ()=>({
        cwd: vi.fn(()=>'/mock/cwd')
    }));
describe('cacheImageResourceOperation', ()=>{
    let operation;
    let mockHttpService;
    let mockGenerateResourceIdentityFromRequestJob;
    let mockFetchResourceResponseJob;
    let mockStoreResourceResponseToFileJob;
    let mockWebpImageManipulationJob;
    let mockValidateCacheImageRequestRule;
    let mockValidateCacheImageRequestResizeTargetRule;
    let mockCacheManager;
    let mockInputSanitizationService;
    let mockJobQueueManager;
    let mockMetricsService;
    let mockLogger;
    let mockCwd;
    let mockRequest;
    let moduleRef;
    beforeEach(async ()=>{
        mockCwd = '/mock/cwd';
        mockRequest = new CacheImageRequest();
        mockRequest.resourceTarget = 'https://example.com/image.jpg';
        mockRequest.resizeOptions = new ResizeOptions();
        mockRequest.resizeOptions.width = 100;
        mockRequest.resizeOptions.height = 100;
        mockRequest.resizeOptions.quality = 80;
        mockRequest.resizeOptions.format = SupportedResizeFormats.webp;
        mockRequest.resizeOptions.fit = FitOptions.contain;
        mockRequest.resizeOptions.position = PositionOptions.entropy;
        mockRequest.resizeOptions.background = BackgroundOptions.white;
        mockRequest.resizeOptions.trimThreshold = 10;
        mockHttpService = {};
        mockGenerateResourceIdentityFromRequestJob = {
            handle: vi.fn()
        };
        vi.spyOn(mockGenerateResourceIdentityFromRequestJob, 'handle').mockResolvedValue('mock-resource-id');
        mockFetchResourceResponseJob = {
            handle: vi.fn()
        };
        const axiosHeaders = new AxiosHeaders();
        axiosHeaders.set('content-type', 'image/jpeg');
        const mockResponse = {
            status: 200,
            statusText: 'OK',
            headers: {
                'content-type': 'image/jpeg'
            },
            data: Buffer.from('mock-image-data'),
            config: {
                headers: axiosHeaders,
                url: 'https://example.com/image.jpg',
                method: 'GET'
            }
        };
        vi.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValue(mockResponse);
        mockStoreResourceResponseToFileJob = {
            handle: vi.fn()
        };
        vi.spyOn(mockStoreResourceResponseToFileJob, 'handle').mockResolvedValue();
        mockWebpImageManipulationJob = {
            handle: vi.fn()
        };
        vi.spyOn(mockWebpImageManipulationJob, 'handle').mockResolvedValue({
            format: 'webp',
            size: '1000'
        });
        mockValidateCacheImageRequestRule = {
            setup: vi.fn(),
            apply: vi.fn()
        };
        mockValidateCacheImageRequestResizeTargetRule = {
            setup: vi.fn(),
            apply: vi.fn()
        };
        mockCacheManager = {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
            exists: vi.fn()
        };
        mockInputSanitizationService = {
            sanitize: vi.fn(),
            validateUrl: vi.fn(),
            validateFileSize: vi.fn(),
            validateImageDimensions: vi.fn()
        };
        mockJobQueueManager = {
            addImageProcessingJob: vi.fn()
        };
        mockMetricsService = {
            recordCacheOperation: vi.fn(),
            recordImageProcessing: vi.fn(),
            recordError: vi.fn()
        };
        mockLogger = {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn()
        };
        // Setup default mock behaviors
        vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null);
        vi.spyOn(mockCacheManager, 'set').mockResolvedValue();
        vi.spyOn(mockCacheManager, 'delete').mockResolvedValue();
        vi.spyOn(mockCacheManager, 'exists').mockResolvedValue(false);
        vi.spyOn(mockInputSanitizationService, 'sanitize').mockImplementation(async (input)=>input);
        vi.spyOn(mockInputSanitizationService, 'validateUrl').mockReturnValue(true);
        vi.spyOn(mockInputSanitizationService, 'validateFileSize').mockReturnValue(true);
        vi.spyOn(mockInputSanitizationService, 'validateImageDimensions').mockReturnValue(true);
        vi.spyOn(mockJobQueueManager, 'addImageProcessingJob').mockResolvedValue({});
        moduleRef = await Test.createTestingModule({
            providers: [
                CacheImageResourceOperation,
                {
                    provide: HttpService,
                    useValue: mockHttpService
                },
                {
                    provide: GenerateResourceIdentityFromRequestJob,
                    useValue: mockGenerateResourceIdentityFromRequestJob
                },
                {
                    provide: FetchResourceResponseJob,
                    useValue: mockFetchResourceResponseJob
                },
                {
                    provide: StoreResourceResponseToFileJob,
                    useValue: mockStoreResourceResponseToFileJob
                },
                {
                    provide: WebpImageManipulationJob,
                    useValue: mockWebpImageManipulationJob
                },
                {
                    provide: ValidateCacheImageRequestRule,
                    useValue: mockValidateCacheImageRequestRule
                },
                {
                    provide: ValidateCacheImageRequestResizeTargetRule,
                    useValue: mockValidateCacheImageRequestResizeTargetRule
                },
                {
                    provide: MultiLayerCacheManager,
                    useValue: mockCacheManager
                },
                {
                    provide: InputSanitizationService,
                    useValue: mockInputSanitizationService
                },
                {
                    provide: JobQueueManager,
                    useValue: mockJobQueueManager
                },
                {
                    provide: MetricsService,
                    useValue: mockMetricsService
                },
                {
                    provide: Logger,
                    useValue: mockLogger
                }
            ]
        }).compile();
        operation = await moduleRef.resolve(CacheImageResourceOperation);
    });
    describe('resource Path Getters', ()=>{
        beforeEach(async ()=>{
            operation.id = 'test-resource';
            await operation.setup(mockRequest);
        });
        it('should return correct resource path', ()=>{
            const expected = path.normalize(path.join(mockCwd, 'storage', `${operation.id}.rsc`));
            const resourcePath = operation.getResourcePath;
            expect(resourcePath).toBe(expected);
        });
        it('should return correct resource temp path', ()=>{
            const expected = path.normalize(path.join(mockCwd, 'storage', `${operation.id}.rst`));
            const resourceTempPath = operation.getResourceTempPath;
            expect(resourceTempPath).toBe(expected);
        });
        it('should return correct resource meta path', ()=>{
            const expected = path.normalize(path.join(mockCwd, 'storage', `${operation.id}.rsm`));
            const resourceMetaPath = operation.getResourceMetaPath;
            expect(resourceMetaPath).toBe(expected);
        });
    });
    describe('setup with new infrastructure', ()=>{
        it('should sanitize input and validate URL', async ()=>{
            await operation.setup(mockRequest);
            expect(mockInputSanitizationService.sanitize).toHaveBeenCalledWith(mockRequest);
            expect(mockInputSanitizationService.validateUrl).toHaveBeenCalledWith(mockRequest.resourceTarget);
            expect(mockInputSanitizationService.validateImageDimensions).toHaveBeenCalledWith(100, 100);
        });
        it('should throw error for invalid URL', async ()=>{
            vi.spyOn(mockInputSanitizationService, 'validateUrl').mockReturnValue(false);
            await expect(operation.setup(mockRequest)).rejects.toThrow('Invalid or disallowed URL');
            expect(mockMetricsService.recordError).toHaveBeenCalledWith('validation', 'setup');
        });
        it('should throw error for invalid dimensions', async ()=>{
            vi.spyOn(mockInputSanitizationService, 'validateImageDimensions').mockReturnValue(false);
            await expect(operation.setup(mockRequest)).rejects.toThrow('Invalid image dimensions');
            expect(mockMetricsService.recordError).toHaveBeenCalledWith('validation', 'setup');
        });
    });
    describe('resourceExists with cache integration', ()=>{
        beforeEach(async ()=>{
            await operation.setup(mockRequest);
        });
        it('should return true when resource exists in cache and is valid', async ()=>{
            const mockCachedResource = {
                data: Buffer.from('cached-data'),
                metadata: new ResourceMetaData({
                    version: 1,
                    size: '1000',
                    format: 'webp',
                    dateCreated: Date.now(),
                    publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                    privateTTL: 6 * 30 * 24 * 60 * 60 * 1000
                })
            };
            vi.spyOn(mockCacheManager, 'get').mockResolvedValue(mockCachedResource);
            const result = await operation.resourceExists;
            expect(result).toBe(true);
            expect(mockCacheManager.get).toHaveBeenCalledWith('image', operation.id);
            expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'hit', expect.any(Number));
        });
        it('should delete expired resource from cache', async ()=>{
            const expiredResource = {
                data: Buffer.from('expired-data'),
                metadata: new ResourceMetaData({
                    version: 1,
                    size: '1000',
                    format: 'webp',
                    dateCreated: Date.now() - 7 * 30 * 24 * 60 * 60 * 1000,
                    publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                    privateTTL: 6 * 30 * 24 * 60 * 60 * 1000
                })
            };
            vi.spyOn(mockCacheManager, 'get').mockResolvedValue(expiredResource);
            const mockedFs = vi.mocked(fs);
            mockedFs.access.mockResolvedValue();
            await operation.resourceExists;
            expect(mockCacheManager.delete).toHaveBeenCalledWith('image', operation.id);
        });
        it('should fallback to filesystem when cache miss', async ()=>{
            vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null);
            const mockedFs = vi.mocked(fs);
            mockedFs.access.mockResolvedValue();
            mockedFs.readFile.mockResolvedValue(JSON.stringify({
                version: 1,
                size: '1000',
                format: 'webp',
                dateCreated: Date.now(),
                publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                privateTTL: 6 * 30 * 24 * 60 * 60 * 1000
            }));
            const result = await operation.resourceExists;
            expect(result).toBe(true);
            expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'hit', expect.any(Number));
        });
    });
    describe('execute with background processing', ()=>{
        beforeEach(async ()=>{
            await operation.setup(mockRequest);
        });
        it('should return early if resource already exists', async ()=>{
            const mockCachedResource = {
                data: Buffer.from('cached-data'),
                metadata: new ResourceMetaData({
                    version: 1,
                    size: '1000',
                    format: 'webp',
                    dateCreated: Date.now(),
                    publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                    privateTTL: 6 * 30 * 24 * 60 * 60 * 1000
                })
            };
            vi.spyOn(mockCacheManager, 'get').mockResolvedValue(mockCachedResource);
            await operation.execute();
            expect(mockFetchResourceResponseJob.handle).not.toHaveBeenCalled();
            expect(mockMetricsService.recordImageProcessing).toHaveBeenCalledWith('cache_check', 'cached', 'success', expect.any(Number));
        });
        it('should queue large image processing in background', async ()=>{
            // Set up large image dimensions (> 2MP threshold)
            mockRequest.resizeOptions.width = 2000;
            mockRequest.resizeOptions.height = 1500; // 3MP total
            await operation.setup(mockRequest);
            // Mock shouldUseBackgroundProcessing to return true for this test
            vi.spyOn(operation, 'shouldUseBackgroundProcessing').mockReturnValue(true);
            // Ensure cache returns null so resource doesn't exist
            vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null);
            // Mock filesystem access to return false (resource doesn't exist)
            const mockedFs = vi.mocked(fs);
            mockedFs.access.mockRejectedValue(new Error('File not found'));
            await operation.execute();
            expect(mockJobQueueManager.addImageProcessingJob).toHaveBeenCalledWith({
                imageUrl: mockRequest.resourceTarget,
                width: mockRequest.resizeOptions.width,
                height: mockRequest.resizeOptions.height,
                quality: mockRequest.resizeOptions.quality,
                format: mockRequest.resizeOptions.format,
                fit: mockRequest.resizeOptions.fit,
                position: mockRequest.resizeOptions.position,
                background: mockRequest.resizeOptions.background,
                trimThreshold: mockRequest.resizeOptions.trimThreshold,
                cacheKey: operation.id,
                priority: expect.any(Number)
            });
        });
        it('should process small images synchronously', async ()=>{
            vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null);
            const mockedFs = vi.mocked(fs);
            mockedFs.readFile.mockResolvedValue(Buffer.from('processed-image-data'));
            await operation.execute();
            expect(mockFetchResourceResponseJob.handle).toHaveBeenCalled();
            expect(mockWebpImageManipulationJob.handle).toHaveBeenCalled();
            expect(mockCacheManager.set).toHaveBeenCalledWith('image', operation.id, expect.any(Object), expect.any(Number));
        });
        it('should validate file size during processing', async ()=>{
            vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null);
            vi.spyOn(mockInputSanitizationService, 'validateFileSize').mockReturnValue(false);
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: {
                    'content-length': '50000000'
                },
                data: Buffer.from('large-image-data'),
                config: {}
            };
            vi.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValue(mockResponse);
            await expect(operation.execute()).rejects.toThrow('Error fetching or processing image.');
            expect(mockMetricsService.recordImageProcessing).toHaveBeenCalledWith('execute', 'unknown', 'error', expect.any(Number));
        });
    });
    describe('getCachedResource', ()=>{
        beforeEach(async ()=>{
            await operation.setup(mockRequest);
        });
        it('should return cached resource from multi-layer cache', async ()=>{
            const mockCachedResource = {
                data: Buffer.from('cached-data'),
                metadata: new ResourceMetaData({
                    version: 1,
                    size: '1000',
                    format: 'webp',
                    dateCreated: Date.now(),
                    publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                    privateTTL: 6 * 30 * 24 * 60 * 60 * 1000
                })
            };
            vi.spyOn(mockCacheManager, 'get').mockResolvedValue(mockCachedResource);
            const result = await operation.getCachedResource();
            expect(result).toEqual(mockCachedResource);
            expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'hit', expect.any(Number));
        });
        it('should fallback to filesystem and cache result', async ()=>{
            vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null);
            const mockedFs = vi.mocked(fs);
            mockedFs.access.mockResolvedValue();
            mockedFs.readFile.mockResolvedValueOnce(Buffer.from('file-data')).mockResolvedValueOnce(JSON.stringify({
                version: 1,
                size: '1000',
                format: 'webp',
                dateCreated: Date.now(),
                publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                privateTTL: 6 * 30 * 24 * 60 * 60 * 1000
            }));
            const result = await operation.getCachedResource();
            expect(result).toBeDefined();
            expect(result?.data).toEqual(Buffer.from('file-data'));
            expect(mockCacheManager.set).toHaveBeenCalledWith('image', operation.id, expect.any(Object), expect.any(Number));
            expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'hit', expect.any(Number));
        });
        it('should return null when resource not found', async ()=>{
            vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null);
            const mockedFs = vi.mocked(fs);
            mockedFs.access.mockRejectedValue(new Error('File not found'));
            const result = await operation.getCachedResource();
            expect(result).toBeNull();
            expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'miss', expect.any(Number));
        });
        it('should handle errors gracefully', async ()=>{
            vi.spyOn(mockCacheManager, 'get').mockRejectedValue(new Error('Cache error'));
            const result = await operation.getCachedResource();
            expect(result).toBeNull();
            expect(mockMetricsService.recordError).toHaveBeenCalledWith('cache_retrieval', 'get_cached_resource');
            expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'error', expect.any(Number));
        });
    });
    describe('optimizeAndServeDefaultImage', ()=>{
        it('should optimize and serve default image with custom options', async ()=>{
            const customOptions = new ResizeOptions();
            customOptions.width = 100;
            customOptions.height = 100;
            customOptions.fit = FitOptions.contain;
            customOptions.position = PositionOptions.entropy;
            customOptions.format = SupportedResizeFormats.webp;
            customOptions.background = BackgroundOptions.white;
            customOptions.trimThreshold = 5;
            customOptions.quality = 100;
            const mockedFs = vi.mocked(fs);
            mockedFs.access.mockRejectedValueOnce({
                code: 'ENOENT'
            });
            const result = await operation.optimizeAndServeDefaultImage(customOptions);
            expect(result).toBeDefined();
            expect(mockWebpImageManipulationJob.handle).toHaveBeenCalledWith(path.normalize(path.join(mockCwd, 'public', 'default.png')), expect.any(String), expect.objectContaining({
                width: 100,
                height: 100,
                fit: FitOptions.contain,
                position: PositionOptions.entropy,
                format: SupportedResizeFormats.webp,
                background: BackgroundOptions.white,
                trimThreshold: 5,
                quality: 100
            }));
        });
    });
});

//# sourceMappingURL=cache-image-resource.operation.spec.js.map