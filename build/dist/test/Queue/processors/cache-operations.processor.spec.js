import { Buffer } from "node:buffer";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { MultiLayerCacheManager } from "../../../MediaStream/Cache/services/multi-layer-cache.manager.js";
import { CorrelationService } from "../../../MediaStream/Correlation/services/correlation.service.js";
import { HttpClientService } from "../../../MediaStream/HTTP/services/http-client.service.js";
import { CacheOperationsProcessor } from "../../../MediaStream/Queue/processors/cache-operations.processor.js";
import { JobPriority } from "../../../MediaStream/Queue/types/job.types.js";
import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Mock fs module
vi.mock('node:fs/promises');
const mockFs = fs;
describe('cacheOperationsProcessor', ()=>{
    let processor;
    let mockCacheManager;
    let mockCorrelationService;
    let mockHttpClient;
    const createMockWarmingJob = (data)=>({
            id: 'test-job',
            name: 'cache-warming',
            data: {
                correlationId: 'corr-123',
                imageUrls: [
                    'https://example.com/image.jpg'
                ],
                priority: JobPriority.LOW,
                batchSize: 5,
                ...data
            },
            opts: {},
            progress: 0,
            delay: 0,
            timestamp: Date.now(),
            attemptsMade: 0
        });
    const createMockCleanupJob = (data)=>({
            id: 'cleanup-job',
            name: 'cache-cleanup',
            data: {
                correlationId: 'corr-123',
                maxAge: 3600000,
                maxSize: 1024 * 1024,
                priority: JobPriority.LOW,
                ...data
            },
            opts: {},
            progress: 0,
            delay: 0,
            timestamp: Date.now(),
            attemptsMade: 0
        });
    beforeEach(async ()=>{
        const mockCacheManagerFactory = {
            get: vi.fn(),
            set: vi.fn(),
            getStats: vi.fn()
        };
        const mockCorrelationServiceFactory = {
            getCorrelationId: vi.fn(),
            setCorrelationId: vi.fn(),
            runWithContext: vi.fn((context, fn)=>fn())
        };
        const mockHttpClientFactory = {
            get: vi.fn()
        };
        const module = await Test.createTestingModule({
            providers: [
                CacheOperationsProcessor,
                {
                    provide: MultiLayerCacheManager,
                    useValue: mockCacheManagerFactory
                },
                {
                    provide: CorrelationService,
                    useValue: mockCorrelationServiceFactory
                },
                {
                    provide: HttpClientService,
                    useValue: mockHttpClientFactory
                }
            ]
        }).compile();
        processor = module.get(CacheOperationsProcessor);
        mockCacheManager = module.get(MultiLayerCacheManager);
        mockCorrelationService = module.get(CorrelationService);
        mockHttpClient = module.get(HttpClientService);
        // Mock logger to avoid console output during tests
        vi.spyOn(Logger.prototype, 'debug').mockImplementation(()=>{});
        vi.spyOn(Logger.prototype, 'log').mockImplementation(()=>{});
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(()=>{});
        vi.spyOn(Logger.prototype, 'error').mockImplementation(()=>{});
    });
    afterEach(()=>{
        vi.clearAllMocks();
        vi.resetAllMocks();
    });
    describe('processCacheWarming', ()=>{
        it('should successfully process cache warming job', async ()=>{
            const job = createMockWarmingJob({
                imageUrls: [
                    'https://example.com/image1.jpg',
                    'https://example.com/image2.jpg'
                ],
                batchSize: 2
            });
            // Mock cache manager responses
            mockCacheManager.get.mockResolvedValue(null); // Not cached
            mockCacheManager.set.mockResolvedValue(undefined);
            // Mock HTTP client responses
            mockHttpClient.get.mockResolvedValue({
                data: Buffer.from('fake-image-data'),
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {}
            });
            const result = await processor.processCacheWarming(job);
            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                successful: 2,
                failed: 0,
                total: 2
            });
            expect(result.processingTime).toBeGreaterThanOrEqual(0);
            expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
            expect(mockCacheManager.set).toHaveBeenCalledTimes(2);
        });
        it('should handle already cached images', async ()=>{
            const job = createMockWarmingJob({
                imageUrls: [
                    'https://example.com/cached-image.jpg'
                ],
                batchSize: 1
            });
            // Mock image already cached
            mockCacheManager.get.mockResolvedValue('cached-data');
            const result = await processor.processCacheWarming(job);
            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                successful: 1,
                failed: 0,
                total: 1
            });
            expect(mockHttpClient.get).not.toHaveBeenCalled();
            expect(mockCacheManager.set).not.toHaveBeenCalled();
        });
        it('should handle HTTP errors during cache warming', async ()=>{
            const job = createMockWarmingJob({
                imageUrls: [
                    'https://example.com/error-image.jpg'
                ],
                batchSize: 1
            });
            mockCacheManager.get.mockResolvedValue(null);
            mockHttpClient.get.mockRejectedValue(new Error('Network error'));
            const result = await processor.processCacheWarming(job);
            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                successful: 0,
                failed: 1,
                total: 1
            });
        });
        it('should handle job processing errors', async ()=>{
            const job = createMockWarmingJob({
                imageUrls: [
                    'https://example.com/image.jpg'
                ],
                batchSize: 1
            });
            // Mock a critical error that breaks the entire job
            mockCacheManager.get.mockRejectedValue(new Error('Cache manager error'));
            const result = await processor.processCacheWarming(job);
            expect(result.success).toBe(true); // The job succeeds but individual images fail
            expect(result.data).toEqual({
                successful: 0,
                failed: 1,
                total: 1
            });
            expect(result.processingTime).toBeGreaterThanOrEqual(0);
        });
        it('should process images in batches', async ()=>{
            const job = createMockWarmingJob({
                imageUrls: [
                    'https://example.com/image1.jpg',
                    'https://example.com/image2.jpg',
                    'https://example.com/image3.jpg'
                ],
                batchSize: 2
            });
            mockCacheManager.get.mockResolvedValue(null);
            mockCacheManager.set.mockResolvedValue(undefined);
            mockHttpClient.get.mockResolvedValue({
                data: Buffer.from('fake-image-data'),
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {}
            });
            const result = await processor.processCacheWarming(job);
            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                successful: 3,
                failed: 0,
                total: 3
            });
            expect(mockHttpClient.get).toHaveBeenCalledTimes(3);
        });
    });
    describe('processCacheCleanup', ()=>{
        beforeEach(()=>{
            // Reset fs mocks
            mockFs.readdir.mockReset();
            mockFs.stat.mockReset();
            mockFs.unlink.mockReset();
        });
        it('should successfully process cache cleanup job', async ()=>{
            const job = createMockCleanupJob({
                maxAge: 3600000,
                maxSize: 1024 * 1024
            });
            // Mock cache manager
            mockCacheManager.getStats.mockResolvedValue({
                layers: {},
                totalHits: 100,
                totalMisses: 50,
                overallHitRate: 0.67,
                layerHitDistribution: {}
            });
            // Mock file system
            mockFs.readdir.mockResolvedValue([
                'old-file.jpg',
                'large-file.jpg'
            ]);
            mockFs.stat.mockImplementation((filePath)=>{
                const fileName = path.basename(filePath);
                if (fileName === 'old-file.jpg') {
                    return Promise.resolve({
                        mtime: new Date(Date.now() - 7200000),
                        size: 500000
                    });
                }
                return Promise.resolve({
                    mtime: new Date(Date.now() - 1800000),
                    size: 2 * 1024 * 1024
                });
            });
            mockFs.unlink.mockResolvedValue(undefined);
            const result = await processor.processCacheCleanup(job);
            expect(result.success).toBe(true);
            expect(result.data.cleaned).toBe(2);
            expect(result.data.errors).toHaveLength(0);
            expect(mockFs.unlink).toHaveBeenCalledTimes(2);
        });
        it('should handle missing cache directory', async ()=>{
            const job = createMockCleanupJob({
                maxAge: 3600000,
                maxSize: 1024 * 1024
            });
            mockCacheManager.getStats.mockResolvedValue({
                layers: {},
                totalHits: 100,
                totalMisses: 50,
                overallHitRate: 0.67,
                layerHitDistribution: {}
            });
            // Mock directory not found
            const error = new Error('Directory not found');
            error.code = 'ENOENT';
            mockFs.readdir.mockRejectedValue(error);
            const result = await processor.processCacheCleanup(job);
            expect(result.success).toBe(true);
            expect(result.data.cleaned).toBe(0);
        });
        it('should handle file processing errors', async ()=>{
            const job = createMockCleanupJob({
                maxAge: 3600000,
                maxSize: 1024 * 1024
            });
            mockCacheManager.getStats.mockResolvedValue({
                layers: {},
                totalHits: 100,
                totalMisses: 50,
                overallHitRate: 0.67,
                layerHitDistribution: {}
            });
            mockFs.readdir.mockResolvedValue([
                'error-file.jpg'
            ]);
            mockFs.stat.mockRejectedValue(new Error('File access error'));
            const result = await processor.processCacheCleanup(job);
            expect(result.success).toBe(true);
            expect(result.data.cleaned).toBe(0);
        });
        it('should handle memory cache cleanup errors', async ()=>{
            const job = createMockCleanupJob({
                maxAge: 3600000,
                maxSize: 1024 * 1024
            });
            // Mock memory cache error
            mockCacheManager.getStats.mockRejectedValue(new Error('Memory cache error'));
            // Mock successful file cleanup
            mockFs.readdir.mockResolvedValue([]);
            const result = await processor.processCacheCleanup(job);
            expect(result.success).toBe(false);
            expect(result.data.errors).toContain('memory cache: Memory cache cleanup failed: Memory cache error');
        });
        it('should handle job processing errors', async ()=>{
            const job = createMockCleanupJob({
                maxAge: 3600000,
                maxSize: 1024 * 1024
            });
            // Mock a critical error that breaks the entire job by throwing synchronously
            const processor = new CacheOperationsProcessor(mockCorrelationService, mockCacheManager, mockHttpClient);
            // Override the private method to throw an error
            vi.spyOn(processor, 'cleanupMemoryCache').mockImplementation(()=>{
                throw new Error('Critical cache error');
            });
            const result = await processor.processCacheCleanup(job);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Critical cache error');
            expect(result.processingTime).toBeGreaterThanOrEqual(0);
        });
    });
    describe('generateCacheKey', ()=>{
        it('should generate consistent cache keys', ()=>{
            const processor = new CacheOperationsProcessor(mockCorrelationService, mockCacheManager, mockHttpClient);
            const url = 'https://example.com/image.jpg';
            const key1 = processor.generateCacheKey(url);
            const key2 = processor.generateCacheKey(url);
            expect(key1).toBe(key2);
            expect(key1).toMatch(/^image:/);
        });
        it('should generate different keys for different URLs', ()=>{
            const processor = new CacheOperationsProcessor(mockCorrelationService, mockCacheManager, mockHttpClient);
            const url1 = 'https://example.com/image1.jpg';
            const url2 = 'https://example.com/image2.jpg';
            const key1 = processor.generateCacheKey(url1);
            const key2 = processor.generateCacheKey(url2);
            expect(key1).not.toBe(key2);
        });
    });
});

//# sourceMappingURL=cache-operations.processor.spec.js.map