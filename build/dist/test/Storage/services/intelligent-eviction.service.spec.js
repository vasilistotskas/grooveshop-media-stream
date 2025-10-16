import { promises as fs } from "node:fs";
import { ConfigService } from "../../../MediaStream/Config/config.service.js";
import { IntelligentEvictionService } from "../../../MediaStream/Storage/services/intelligent-eviction.service.js";
import { StorageMonitoringService } from "../../../MediaStream/Storage/services/storage-monitoring.service.js";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Mock fs module
vi.mock('node:fs', ()=>({
        promises: {
            unlink: vi.fn()
        }
    }));
const mockFs = fs;
describe('intelligentEvictionService', ()=>{
    let service;
    let storageMonitoring;
    let configService;
    const mockAccessPatterns = [
        {
            file: 'old-file.jpg',
            lastAccessed: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
            accessCount: 1,
            size: 1024 * 1024,
            extension: '.jpg'
        },
        {
            file: 'popular-file.webp',
            lastAccessed: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
            accessCount: 50,
            size: 2 * 1024 * 1024,
            extension: '.webp'
        },
        {
            file: 'medium-file.png',
            lastAccessed: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            accessCount: 5,
            size: 512 * 1024,
            extension: '.png'
        }
    ];
    beforeEach(async ()=>{
        const mockStorageMonitoring = {
            getStorageStats: vi.fn(),
            getEvictionCandidates: vi.fn(),
            checkThresholds: vi.fn()
        };
        const mockConfigService = {
            get: vi.fn().mockImplementation((key)=>{
                if (key === 'cache.file.directory') return '/test/storage';
                return undefined;
            }),
            getOptional: vi.fn().mockImplementation((key, defaultValue)=>{
                const defaults = {
                    'storage.eviction.strategy': 'intelligent',
                    'storage.eviction.aggressiveness': 'moderate',
                    'storage.eviction.preservePopular': true,
                    'storage.eviction.minAccessCount': 5,
                    'storage.eviction.maxFileAge': 7
                };
                return defaults[key] || defaultValue;
            })
        };
        const module = await Test.createTestingModule({
            providers: [
                IntelligentEvictionService,
                {
                    provide: StorageMonitoringService,
                    useValue: mockStorageMonitoring
                },
                {
                    provide: ConfigService,
                    useValue: mockConfigService
                }
            ]
        }).compile();
        service = module.get(IntelligentEvictionService);
        storageMonitoring = module.get(StorageMonitoringService);
        configService = module.get(ConfigService);
        // Setup storage monitoring mocks
        storageMonitoring.getEvictionCandidates.mockResolvedValue(mockAccessPatterns);
        storageMonitoring.getStorageStats.mockResolvedValue({
            totalFiles: 3,
            totalSize: 3.5 * 1024 * 1024,
            averageFileSize: 1.17 * 1024 * 1024,
            oldestFile: new Date(),
            newestFile: new Date(),
            fileTypes: {},
            accessPatterns: mockAccessPatterns
        });
        // Setup fs mocks
        mockFs.unlink.mockResolvedValue(undefined);
    });
    afterEach(()=>{
        vi.clearAllMocks();
    });
    describe('performEviction', ()=>{
        it('should perform eviction with intelligent strategy', async ()=>{
            const result = await service.performEviction(1024 * 1024) // 1MB target
            ;
            expect(result.filesEvicted).toBeGreaterThan(0);
            expect(result.sizeFreed).toBeGreaterThan(0);
            expect(result.strategy).toBe('intelligent');
            expect(result.errors).toEqual([]);
            expect(result.duration).toBeGreaterThan(0);
        });
        it('should return zero results when no candidates available', async ()=>{
            storageMonitoring.getEvictionCandidates.mockResolvedValue([]);
            const result = await service.performEviction();
            expect(result.filesEvicted).toBe(0);
            expect(result.sizeFreed).toBe(0);
            expect(result.errors).toEqual([]);
        });
        it('should handle file deletion errors gracefully', async ()=>{
            mockFs.unlink.mockRejectedValue(new Error('Permission denied'));
            const result = await service.performEviction();
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('Permission denied');
        });
        it('should respect target size when specified', async ()=>{
            const targetSize = 512 * 1024 // 512KB
            ;
            const result = await service.performEviction(targetSize);
            expect(result.sizeFreed).toBeGreaterThanOrEqual(targetSize);
        });
    });
    describe('performThresholdBasedEviction', ()=>{
        it('should not evict when storage is healthy', async ()=>{
            storageMonitoring.checkThresholds.mockResolvedValue({
                status: 'healthy',
                issues: [],
                stats: {
                    totalSize: 100 * 1024 * 1024,
                    totalFiles: 100,
                    averageFileSize: 1024 * 1024,
                    oldestFile: new Date('2024-01-01'),
                    newestFile: new Date('2024-01-15'),
                    fileTypes: {
                        '.jpg': 50,
                        '.png': 30,
                        '.webp': 20
                    },
                    accessPatterns: []
                }
            });
            const result = await service.performThresholdBasedEviction();
            expect(result.filesEvicted).toBe(0);
            expect(result.strategy).toBe('threshold-based');
        });
        it('should perform moderate cleanup on warning status', async ()=>{
            storageMonitoring.checkThresholds.mockResolvedValue({
                status: 'warning',
                issues: [
                    'Storage size warning'
                ],
                stats: {
                    totalSize: 800 * 1024 * 1024,
                    totalFiles: 1000,
                    averageFileSize: 800 * 1024,
                    oldestFile: new Date('2024-01-01'),
                    newestFile: new Date('2024-01-15'),
                    fileTypes: {
                        '.jpg': 500,
                        '.png': 300,
                        '.webp': 200
                    },
                    accessPatterns: []
                }
            });
            const result = await service.performThresholdBasedEviction();
            expect(result.filesEvicted).toBeGreaterThan(0);
            // Should target 20% of storage (160MB)
            expect(storageMonitoring.getEvictionCandidates).toHaveBeenCalledWith(160 * 1024 * 1024);
        });
        it('should perform aggressive cleanup on critical status', async ()=>{
            storageMonitoring.checkThresholds.mockResolvedValue({
                status: 'critical',
                issues: [
                    'Storage size critical'
                ],
                stats: {
                    totalSize: 1000 * 1024 * 1024,
                    totalFiles: 2000,
                    averageFileSize: 500 * 1024,
                    oldestFile: new Date('2024-01-01'),
                    newestFile: new Date('2024-01-15'),
                    fileTypes: {
                        '.jpg': 1000,
                        '.png': 600,
                        '.webp': 400
                    },
                    accessPatterns: []
                }
            });
            const result = await service.performThresholdBasedEviction();
            expect(result.filesEvicted).toBeGreaterThan(0);
            // Should target 40% of storage (400MB)
            expect(storageMonitoring.getEvictionCandidates).toHaveBeenCalledWith(400 * 1024 * 1024);
        });
    });
    describe('getEvictionRecommendations', ()=>{
        it('should return eviction recommendations without executing', async ()=>{
            const recommendations = await service.getEvictionRecommendations();
            expect(recommendations.candidates).toBeDefined();
            expect(recommendations.totalSize).toBeGreaterThan(0);
            expect(recommendations.strategy).toBe('intelligent');
            expect(recommendations.reasoning).toBeInstanceOf(Array);
            expect(recommendations.reasoning.length).toBeGreaterThan(0);
        });
        it('should provide detailed reasoning for recommendations', async ()=>{
            const recommendations = await service.getEvictionRecommendations(1024 * 1024);
            expect(recommendations.reasoning).toContainEqual(expect.stringMatching(/Selected \d+ files totaling/));
            expect(recommendations.reasoning).toContainEqual(expect.stringMatching(/Average access count:/));
            expect(recommendations.reasoning).toContainEqual(expect.stringMatching(/Strategy: intelligent/));
        });
    });
    describe('eviction strategies', ()=>{
        it('should apply LRU strategy correctly', async ()=>{
            // Mock config to use LRU strategy
            configService.getOptional.mockImplementation((key, defaultValue)=>{
                if (key === 'storage.eviction.strategy') return 'lru';
                const defaults = {
                    'storage.eviction.aggressiveness': 'moderate',
                    'storage.eviction.preservePopular': true,
                    'storage.eviction.minAccessCount': 5,
                    'storage.eviction.maxFileAge': 7
                };
                return defaults[key] || defaultValue;
            });
            // Recreate service with new config
            const module = await Test.createTestingModule({
                providers: [
                    IntelligentEvictionService,
                    {
                        provide: StorageMonitoringService,
                        useValue: storageMonitoring
                    },
                    {
                        provide: ConfigService,
                        useValue: configService
                    }
                ]
            }).compile();
            const lruService = module.get(IntelligentEvictionService);
            const result = await lruService.performEviction();
            expect(result.strategy).toBe('lru');
        });
        it('should apply size-based strategy correctly', async ()=>{
            configService.getOptional.mockImplementation((key, defaultValue)=>{
                if (key === 'storage.eviction.strategy') return 'size-based';
                const defaults = {
                    'storage.eviction.aggressiveness': 'moderate',
                    'storage.eviction.preservePopular': true,
                    'storage.eviction.minAccessCount': 5,
                    'storage.eviction.maxFileAge': 7
                };
                return defaults[key] || defaultValue;
            });
            const module = await Test.createTestingModule({
                providers: [
                    IntelligentEvictionService,
                    {
                        provide: StorageMonitoringService,
                        useValue: storageMonitoring
                    },
                    {
                        provide: ConfigService,
                        useValue: configService
                    }
                ]
            }).compile();
            const sizeService = module.get(IntelligentEvictionService);
            const result = await sizeService.performEviction();
            expect(result.strategy).toBe('size-based');
        });
        it('should preserve popular files when configured', async ()=>{
            // Set high access count threshold
            configService.getOptional.mockImplementation((key, defaultValue)=>{
                if (key === 'storage.eviction.minAccessCount') return 40;
                if (key === 'storage.eviction.preservePopular') return true;
                const defaults = {
                    'storage.eviction.strategy': 'intelligent',
                    'storage.eviction.aggressiveness': 'moderate',
                    'storage.eviction.maxFileAge': 7
                };
                return defaults[key] || defaultValue;
            });
            await service.performEviction();
            // Popular file should be preserved (has 50 access count)
            expect(mockFs.unlink).not.toHaveBeenCalledWith(expect.stringContaining('popular-file.webp'));
        });
    });
    describe('error handling', ()=>{
        it('should handle unknown strategy gracefully', async ()=>{
            // Create a new service instance with unknown strategy configuration
            const unknownStrategyConfigService = {
                get: vi.fn().mockImplementation((key)=>{
                    if (key === 'cache.file.directory') return '/test/storage';
                    return undefined;
                }),
                getOptional: vi.fn().mockImplementation((key, defaultValue)=>{
                    if (key === 'storage.eviction.strategy') return 'unknown-strategy';
                    const defaults = {
                        'storage.eviction.aggressiveness': 'moderate',
                        'storage.eviction.preservePopular': true,
                        'storage.eviction.minAccessCount': 5,
                        'storage.eviction.maxFileAge': 7
                    };
                    return defaults[key] || defaultValue;
                })
            };
            const unknownStrategyModule = await Test.createTestingModule({
                providers: [
                    IntelligentEvictionService,
                    {
                        provide: StorageMonitoringService,
                        useValue: storageMonitoring
                    },
                    {
                        provide: ConfigService,
                        useValue: unknownStrategyConfigService
                    }
                ]
            }).compile();
            const unknownStrategyService = unknownStrategyModule.get(IntelligentEvictionService);
            const result = await unknownStrategyService.performEviction();
            expect(result.errors).toContainEqual(expect.stringMatching(/Unknown eviction strategy/));
            expect(result.filesEvicted).toBe(0);
        });
        it('should handle storage monitoring errors', async ()=>{
            storageMonitoring.getEvictionCandidates.mockRejectedValue(new Error('Storage error'));
            const result = await service.performEviction();
            expect(result.errors).toContainEqual(expect.stringMatching(/Storage error/));
            expect(result.filesEvicted).toBe(0);
        });
    });
});

//# sourceMappingURL=intelligent-eviction.service.spec.js.map