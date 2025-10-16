import { RedisCacheLayer } from "../../../MediaStream/Cache/layers/redis-cache.layer.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
describe('redisCacheLayer', ()=>{
    let layer;
    let mockRedisCacheService;
    beforeEach(()=>{
        mockRedisCacheService = {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
            has: vi.fn(),
            exists: vi.fn(),
            clear: vi.fn(),
            getStats: vi.fn(),
            getConnectionStatus: vi.fn()
        };
        layer = new RedisCacheLayer(mockRedisCacheService);
    });
    describe('basic Operations', ()=>{
        it('should get value from redis cache service', async ()=>{
            const testValue = {
                data: 'test'
            };
            mockRedisCacheService.get.mockResolvedValue(testValue);
            const result = await layer.get('test-key');
            expect(result).toEqual(testValue);
            expect(mockRedisCacheService.get).toHaveBeenCalledWith('test-key');
        });
        it('should return null when redis get fails', async ()=>{
            mockRedisCacheService.get.mockRejectedValue(new Error('Redis error'));
            const result = await layer.get('test-key');
            expect(result).toBeNull();
        });
        it('should set value in redis cache service', async ()=>{
            const testValue = {
                data: 'test'
            };
            mockRedisCacheService.set.mockResolvedValue(undefined);
            await layer.set('test-key', testValue, 3600);
            expect(mockRedisCacheService.set).toHaveBeenCalledWith('test-key', testValue, 3600);
        });
        it('should silently fail when redis set fails', async ()=>{
            const testValue = {
                data: 'test'
            };
            mockRedisCacheService.set.mockRejectedValue(new Error('Redis error'));
            await expect(layer.set('test-key', testValue, 3600)).resolves.not.toThrow();
        });
        it('should delete key from redis cache service', async ()=>{
            mockRedisCacheService.delete.mockResolvedValue(undefined);
            await layer.delete('test-key');
            expect(mockRedisCacheService.delete).toHaveBeenCalledWith('test-key');
        });
        it('should silently fail when redis delete fails', async ()=>{
            mockRedisCacheService.delete.mockRejectedValue(new Error('Redis error'));
            await expect(layer.delete('test-key')).resolves.not.toThrow();
        });
        it('should check existence in redis cache service', async ()=>{
            mockRedisCacheService.has.mockResolvedValue(true);
            const result = await layer.exists('test-key');
            expect(result).toBe(true);
            expect(mockRedisCacheService.has).toHaveBeenCalledWith('test-key');
        });
        it('should return false when redis exists check fails', async ()=>{
            mockRedisCacheService.has.mockRejectedValue(new Error('Redis error'));
            const result = await layer.exists('test-key');
            expect(result).toBe(false);
        });
        it('should clear redis cache service', async ()=>{
            mockRedisCacheService.clear.mockResolvedValue(undefined);
            await layer.clear();
            expect(mockRedisCacheService.clear).toHaveBeenCalled();
        });
        it('should silently fail when redis clear fails', async ()=>{
            mockRedisCacheService.clear.mockRejectedValue(new Error('Redis error'));
            await expect(layer.clear()).resolves.not.toThrow();
        });
    });
    describe('statistics', ()=>{
        it('should return formatted stats from redis cache service', async ()=>{
            const mockStats = {
                hits: 80,
                misses: 40,
                keys: 60,
                ksize: 0,
                vsize: 2048,
                hitRate: 0.67
            };
            const mockConnectionStatus = {
                connected: true,
                stats: {
                    hits: 80,
                    misses: 40,
                    operations: 120,
                    errors: 2
                }
            };
            mockRedisCacheService.getStats.mockResolvedValue(mockStats);
            mockRedisCacheService.getConnectionStatus.mockReturnValue(mockConnectionStatus);
            const result = await layer.getStats();
            expect(result).toEqual({
                hits: 80,
                misses: 40,
                keys: 60,
                hitRate: 0.67,
                errors: 2
            });
        });
        it('should return error stats when redis stats fail', async ()=>{
            mockRedisCacheService.getStats.mockRejectedValue(new Error('Redis error'));
            const result = await layer.getStats();
            expect(result).toEqual({
                hits: 0,
                misses: 0,
                keys: 0,
                hitRate: 0,
                errors: 1
            });
        });
    });
    describe('layer Properties', ()=>{
        it('should return correct layer name', ()=>{
            expect(layer.getLayerName()).toBe('redis');
        });
        it('should return correct priority', ()=>{
            expect(layer.getPriority()).toBe(2);
        });
    });
});

//# sourceMappingURL=redis-cache.layer.spec.js.map