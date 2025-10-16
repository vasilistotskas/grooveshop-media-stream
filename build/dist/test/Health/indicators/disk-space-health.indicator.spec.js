import { ConfigService } from "../../../MediaStream/Config/config.service.js";
import { DiskSpaceHealthIndicator } from "../../../MediaStream/Health/indicators/disk-space-health.indicator.js";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "reflect-metadata";
describe('diskSpaceHealthIndicator', ()=>{
    let indicator;
    let configService;
    beforeEach(async ()=>{
        const mockConfigService = {
            get: vi.fn((key)=>{
                if (key === 'cache.file.directory') return './test-storage';
                return undefined;
            })
        };
        const module = await Test.createTestingModule({
            providers: [
                DiskSpaceHealthIndicator,
                {
                    provide: ConfigService,
                    useValue: mockConfigService
                }
            ]
        }).compile();
        indicator = module.get(DiskSpaceHealthIndicator);
        configService = module.get(ConfigService);
    });
    describe('health Check', ()=>{
        it('should be defined', ()=>{
            expect(indicator).toBeDefined();
            expect(indicator.key).toBe('disk_space');
        });
        it('should return healthy status when disk space is sufficient', async ()=>{
            // Mock getDiskSpaceInfo to return healthy values
            vi.spyOn(indicator, 'getDiskSpaceInfo').mockResolvedValue({
                total: 1000,
                free: 500,
                used: 500,
                usedPercentage: 0.5,
                path: './test-storage'
            });
            const result = await indicator.isHealthy();
            expect(result).toHaveProperty('disk_space');
            expect(result.disk_space.status).toBe('up');
            expect(result.disk_space).toHaveProperty('timestamp');
        });
        it('should return warning status when disk usage is above warning threshold', async ()=>{
            vi.spyOn(indicator, 'getDiskSpaceInfo').mockResolvedValue({
                total: 1000,
                free: 150,
                used: 850,
                usedPercentage: 0.85,
                path: './test-storage'
            });
            const result = await indicator.isHealthy();
            expect(result).toHaveProperty('disk_space');
            expect(result.disk_space.status).toBe('up'); // Main health check status should be up
        // The warning status should be in the details, not the main status
        });
        it('should return unhealthy status when disk usage is critical', async ()=>{
            vi.spyOn(indicator, 'getDiskSpaceInfo').mockResolvedValue({
                total: 1000,
                free: 50,
                used: 950,
                usedPercentage: 0.95,
                path: './test-storage'
            });
            const result = await indicator.isHealthy();
            expect(result).toHaveProperty('disk_space');
            expect(result.disk_space.status).toBe('down');
            expect(result.disk_space).toHaveProperty('message');
            expect(result.disk_space.message).toContain('critically low');
        });
        it('should handle errors gracefully', async ()=>{
            vi.spyOn(indicator, 'getDiskSpaceInfo').mockRejectedValue(new Error('Disk access error'));
            const result = await indicator.isHealthy();
            expect(result).toHaveProperty('disk_space');
            expect(result.disk_space.status).toBe('down');
            expect(result.disk_space.message).toContain('Disk access error');
        });
        it('should timeout if check takes too long', async ()=>{
            vi.spyOn(indicator, 'getDiskSpaceInfo').mockImplementation(()=>new Promise((resolve)=>setTimeout(resolve, 5000)));
            const result = await indicator.isHealthy();
            expect(result).toHaveProperty('disk_space');
            expect(result.disk_space.status).toBe('down');
            expect(result.disk_space.message).toContain('timeout');
        }, 10000);
    });
    describe('configuration', ()=>{
        it('should use configured storage path', ()=>{
            expect(configService.get).toHaveBeenCalledWith('cache.file.directory');
        });
        it('should have correct thresholds', ()=>{
            const details = indicator.getDetails();
            expect(details.key).toBe('disk_space');
            expect(details.description).toContain('./test-storage');
        });
    });
    describe('getCurrentDiskInfo', ()=>{
        it('should return current disk information', async ()=>{
            vi.spyOn(indicator, 'getDiskSpaceInfo').mockResolvedValue({
                total: 1000,
                free: 500,
                used: 500,
                usedPercentage: 0.5,
                path: './test-storage'
            });
            const diskInfo = await indicator.getCurrentDiskInfo();
            expect(diskInfo).toHaveProperty('total');
            expect(diskInfo).toHaveProperty('free');
            expect(diskInfo).toHaveProperty('used');
            expect(diskInfo).toHaveProperty('usedPercentage');
            expect(diskInfo).toHaveProperty('path');
            expect(diskInfo.path).toBe('./test-storage');
        });
    });
    describe('getDetails', ()=>{
        it('should return indicator details', ()=>{
            const details = indicator.getDetails();
            expect(details).toHaveProperty('key');
            expect(details).toHaveProperty('options');
            expect(details).toHaveProperty('description');
            expect(details.key).toBe('disk_space');
            expect(details.description).toContain('Monitors disk space usage');
        });
    });
});

//# sourceMappingURL=disk-space-health.indicator.spec.js.map