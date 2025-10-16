import { MemoryHealthIndicator } from "../../../MediaStream/Health/indicators/memory-health.indicator.js";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "reflect-metadata";
describe('memoryHealthIndicator', ()=>{
    let indicator;
    beforeEach(async ()=>{
        const module = await Test.createTestingModule({
            providers: [
                MemoryHealthIndicator
            ]
        }).compile();
        indicator = module.get(MemoryHealthIndicator);
    });
    describe('health Check', ()=>{
        it('should be defined', ()=>{
            expect(indicator).toBeDefined();
            expect(indicator.key).toBe('memory');
        });
        it('should return healthy status when memory usage is normal', async ()=>{
            // Mock getMemoryInfo to return healthy values
            vi.spyOn(indicator, 'getMemoryInfo').mockReturnValue({
                totalMemory: 1000,
                freeMemory: 600,
                usedMemory: 400,
                memoryUsagePercentage: 0.4,
                processMemory: {
                    rss: 100,
                    heapTotal: 50,
                    heapUsed: 25,
                    external: 10,
                    arrayBuffers: 5
                },
                heapUsagePercentage: 0.5
            });
            const result = await indicator.isHealthy();
            expect(result).toHaveProperty('memory');
            expect(result.memory.status).toBe('up');
            expect(result.memory).toHaveProperty('timestamp');
        });
        it('should return warning status when memory usage is above warning threshold', async ()=>{
            vi.spyOn(indicator, 'getMemoryInfo').mockReturnValue({
                totalMemory: 1000,
                freeMemory: 150,
                usedMemory: 850,
                memoryUsagePercentage: 0.85,
                processMemory: {
                    rss: 100,
                    heapTotal: 50,
                    heapUsed: 25,
                    external: 10,
                    arrayBuffers: 5
                },
                heapUsagePercentage: 0.5
            });
            const result = await indicator.isHealthy();
            expect(result).toHaveProperty('memory');
            expect(result.memory.status).toBe('up'); // Main health check status should be up
        // The warning status should be in the details, not the main status
        });
        it('should return unhealthy status when system memory usage is critical', async ()=>{
            vi.spyOn(indicator, 'getMemoryInfo').mockReturnValue({
                totalMemory: 1000,
                freeMemory: 50,
                usedMemory: 950,
                memoryUsagePercentage: 0.95,
                processMemory: {
                    rss: 100,
                    heapTotal: 50,
                    heapUsed: 25,
                    external: 10,
                    arrayBuffers: 5
                },
                heapUsagePercentage: 0.5
            });
            const result = await indicator.isHealthy();
            expect(result).toHaveProperty('memory');
            expect(result.memory.status).toBe('down');
            expect(result.memory).toHaveProperty('message');
            expect(result.memory.message).toContain('System memory critically high');
        });
        it('should return unhealthy status when heap memory usage is critical', async ()=>{
            vi.spyOn(indicator, 'getMemoryInfo').mockReturnValue({
                totalMemory: 1000,
                freeMemory: 600,
                usedMemory: 400,
                memoryUsagePercentage: 0.4,
                processMemory: {
                    rss: 100,
                    heapTotal: 50,
                    heapUsed: 49,
                    external: 10,
                    arrayBuffers: 5
                },
                heapUsagePercentage: 0.99
            });
            const result = await indicator.isHealthy();
            expect(result).toHaveProperty('memory');
            expect(result.memory.status).toBe('down');
            expect(result.memory).toHaveProperty('message');
            expect(result.memory.message).toContain('Heap memory critically high');
        });
        it('should include threshold information in healthy response', async ()=>{
            vi.spyOn(indicator, 'getMemoryInfo').mockReturnValue({
                totalMemory: 1000,
                freeMemory: 600,
                usedMemory: 400,
                memoryUsagePercentage: 0.4,
                processMemory: {
                    rss: 100,
                    heapTotal: 50,
                    heapUsed: 25,
                    external: 10,
                    arrayBuffers: 5
                },
                heapUsagePercentage: 0.5
            });
            const result = await indicator.isHealthy();
            expect(result.memory).toHaveProperty('thresholds');
            expect(result.memory.thresholds).toHaveProperty('systemMemoryWarning');
            expect(result.memory.thresholds).toHaveProperty('systemMemoryCritical');
            expect(result.memory.thresholds).toHaveProperty('heapMemoryWarning');
            expect(result.memory.thresholds).toHaveProperty('heapMemoryCritical');
        });
    });
    describe('getCurrentMemoryInfo', ()=>{
        it('should return current memory information', ()=>{
            const memoryInfo = indicator.getCurrentMemoryInfo();
            expect(memoryInfo).toHaveProperty('totalMemory');
            expect(memoryInfo).toHaveProperty('freeMemory');
            expect(memoryInfo).toHaveProperty('usedMemory');
            expect(memoryInfo).toHaveProperty('memoryUsagePercentage');
            expect(memoryInfo).toHaveProperty('processMemory');
            expect(memoryInfo).toHaveProperty('heapUsagePercentage');
            expect(typeof memoryInfo.totalMemory).toBe('number');
            expect(typeof memoryInfo.memoryUsagePercentage).toBe('number');
            expect(memoryInfo.memoryUsagePercentage).toBeGreaterThanOrEqual(0);
            expect(memoryInfo.memoryUsagePercentage).toBeLessThanOrEqual(1);
        });
        it('should format memory values in MB', ()=>{
            const memoryInfo = indicator.getCurrentMemoryInfo();
            // Values should be in MB (reasonable range for a Node.js process)
            expect(memoryInfo.totalMemory).toBeGreaterThan(0);
            expect(memoryInfo.processMemory.rss).toBeGreaterThan(0);
            expect(memoryInfo.processMemory.heapTotal).toBeGreaterThan(0);
            expect(memoryInfo.processMemory.heapUsed).toBeGreaterThan(0);
        });
    });
    describe('forceGarbageCollection', ()=>{
        it('should return false when gc is not available', ()=>{
            const result = indicator.forceGarbageCollection();
            expect(result).toBe(false);
        });
        it('should return true when gc is available', ()=>{
            // Mock global.gc
            const originalGc = globalThis.gc;
            globalThis.gc = vi.fn();
            const result = indicator.forceGarbageCollection();
            expect(result).toBe(true);
            expect(globalThis.gc).toHaveBeenCalled();
            // Restore original
            globalThis.gc = originalGc;
        });
    });
    describe('getDetails', ()=>{
        it('should return indicator details', ()=>{
            const details = indicator.getDetails();
            expect(details).toHaveProperty('key');
            expect(details).toHaveProperty('options');
            expect(details).toHaveProperty('description');
            expect(details.key).toBe('memory');
            expect(details.description).toContain('Monitors system and process memory usage');
        });
    });
    describe('timeout Handling', ()=>{
        it('should complete within timeout period', async ()=>{
            const startTime = Date.now();
            await indicator.isHealthy();
            const duration = Date.now() - startTime;
            // Should complete well within the 1 second timeout
            expect(duration).toBeLessThan(1000);
        });
    });
});

//# sourceMappingURL=memory-health.indicator.spec.js.map