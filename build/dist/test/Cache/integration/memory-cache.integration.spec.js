import { MemoryCacheService } from "../../../MediaStream/Cache/services/memory-cache.service.js";
import { ConfigService } from "../../../MediaStream/Config/config.service.js";
import { MetricsService } from "../../../MediaStream/Metrics/services/metrics.service.js";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
describe('memoryCacheService Integration', ()=>{
    let service;
    let module;
    beforeAll(async ()=>{
        // Mock environment variables for configuration
        process.env.CACHE_MEMORY_DEFAULT_TTL = '3600';
        process.env.CACHE_MEMORY_CHECK_PERIOD = '600';
        process.env.CACHE_MEMORY_MAX_KEYS = '1000';
        process.env.CACHE_MEMORY_MAX_SIZE = '104857600';
        process.env.MONITORING_ENABLED = 'true';
        module = await Test.createTestingModule({
            providers: [
                MemoryCacheService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: vi.fn().mockImplementation((key)=>{
                            if (key === 'cache.memory') {
                                return {
                                    defaultTtl: 3600,
                                    checkPeriod: 600,
                                    maxKeys: 1000,
                                    maxSize: 104857600,
                                    warningThreshold: 80
                                };
                            }
                            return undefined;
                        })
                    }
                },
                {
                    provide: MetricsService,
                    useValue: {
                        recordCacheOperation: vi.fn(),
                        updateCacheHitRatio: vi.fn()
                    }
                }
            ]
        }).compile();
        service = module.get(MemoryCacheService);
    });
    afterEach(async ()=>{
        await service.clear();
    });
    afterAll(async ()=>{
        await module.close();
    });
    it('should be defined', ()=>{
        expect(service).toBeDefined();
    });
    it('should set and get values', async ()=>{
        const key = 'test-key';
        const value = {
            data: 'test-value',
            timestamp: Date.now()
        };
        await service.set(key, value);
        const result = await service.get(key);
        expect(result).toEqual(value);
    });
    it('should handle TTL expiration', async ()=>{
        const key = 'ttl-test';
        const value = 'test-value';
        const ttl = 1 // 1 second
        ;
        await service.set(key, value, ttl);
        expect(await service.get(key)).toBe(value);
        // Wait for expiration
        await new Promise((resolve)=>setTimeout(resolve, 1100));
        expect(await service.get(key)).toBeNull();
    });
    it('should return cache statistics', async ()=>{
        await service.set('key1', 'value1');
        await service.set('key2', 'value2');
        await service.get('key1'); // Hit
        await service.get('key3'); // Miss
        const stats = await service.getStats();
        expect(stats).toHaveProperty('hits');
        expect(stats).toHaveProperty('misses');
        expect(stats).toHaveProperty('keys');
        expect(stats).toHaveProperty('hitRate');
        expect(stats.keys).toBe(2);
    });
    it('should delete keys', async ()=>{
        const key = 'delete-test';
        const value = 'test-value';
        await service.set(key, value);
        expect(await service.has(key)).toBe(true);
        await service.delete(key);
        expect(await service.has(key)).toBe(false);
    });
    it('should clear all keys', async ()=>{
        await service.set('key1', 'value1');
        await service.set('key2', 'value2');
        await service.clear();
        expect(await service.get('key1')).toBeNull();
        expect(await service.get('key2')).toBeNull();
    });
    it('should return memory usage information', ()=>{
        const memoryUsage = service.getMemoryUsage();
        expect(memoryUsage).toHaveProperty('used');
        expect(memoryUsage).toHaveProperty('total');
        expect(typeof memoryUsage.used).toBe('number');
        expect(typeof memoryUsage.total).toBe('number');
    });
});

//# sourceMappingURL=memory-cache.integration.spec.js.map