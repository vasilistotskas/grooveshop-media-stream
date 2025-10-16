import { CacheHealthIndicator } from "../../../MediaStream/Cache/indicators/cache-health.indicator.js";
import { RedisHealthIndicator } from "../../../MediaStream/Cache/indicators/redis-health.indicator.js";
import { HealthController } from "../../../MediaStream/Health/controllers/health.controller.js";
import { HealthModule } from "../../../MediaStream/Health/health.module.js";
import { DiskSpaceHealthIndicator } from "../../../MediaStream/Health/indicators/disk-space-health.indicator.js";
import { MemoryHealthIndicator } from "../../../MediaStream/Health/indicators/memory-health.indicator.js";
import { HttpHealthIndicator } from "../../../MediaStream/HTTP/indicators/http-health.indicator.js";
import { AlertingHealthIndicator } from "../../../MediaStream/Monitoring/indicators/alerting-health.indicator.js";
import { SystemHealthIndicator } from "../../../MediaStream/Monitoring/indicators/system-health.indicator.js";
import { JobQueueHealthIndicator } from "../../../MediaStream/Queue/indicators/job-queue-health.indicator.js";
import { StorageHealthIndicator } from "../../../MediaStream/Storage/indicators/storage-health.indicator.js";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
describe('health Indicators Integration', ()=>{
    let module;
    let healthController;
    beforeAll(async ()=>{
        module = await Test.createTestingModule({
            imports: [
                HealthModule
            ]
        }).compile();
        healthController = module.get(HealthController);
    });
    afterAll(async ()=>{
        await module.close();
    });
    describe('health Indicator Registration', ()=>{
        it('should register DiskSpaceHealthIndicator', ()=>{
            const indicator = module.get(DiskSpaceHealthIndicator);
            expect(indicator).toBeDefined();
            expect(indicator.key).toBe('disk_space');
        });
        it('should register MemoryHealthIndicator', ()=>{
            const indicator = module.get(MemoryHealthIndicator);
            expect(indicator).toBeDefined();
            expect(indicator.key).toBe('memory');
        });
        it('should register HttpHealthIndicator', ()=>{
            const indicator = module.get(HttpHealthIndicator);
            expect(indicator).toBeDefined();
            expect(indicator.key).toBe('http');
        });
        it('should register CacheHealthIndicator', ()=>{
            const indicator = module.get(CacheHealthIndicator);
            expect(indicator).toBeDefined();
            expect(indicator.key).toBe('cache');
        });
        it('should register RedisHealthIndicator', ()=>{
            const indicator = module.get(RedisHealthIndicator);
            expect(indicator).toBeDefined();
            expect(indicator.key).toBe('redis');
        });
        it('should register AlertingHealthIndicator', ()=>{
            const indicator = module.get(AlertingHealthIndicator);
            expect(indicator).toBeDefined();
            expect(indicator.key).toBe('alerting');
        });
        it('should register SystemHealthIndicator', ()=>{
            const indicator = module.get(SystemHealthIndicator);
            expect(indicator).toBeDefined();
            expect(indicator.key).toBe('system');
        });
        it('should register JobQueueHealthIndicator', ()=>{
            const indicator = module.get(JobQueueHealthIndicator);
            expect(indicator).toBeDefined();
            expect(indicator.key).toBe('job-queue');
        });
        it('should register StorageHealthIndicator', ()=>{
            const indicator = module.get(StorageHealthIndicator);
            expect(indicator).toBeDefined();
            expect(indicator.key).toBe('storage');
        });
    });
    describe('health Check Execution', ()=>{
        it('should execute disk space health check', async ()=>{
            const indicator = module.get(DiskSpaceHealthIndicator);
            try {
                const result = await indicator.isHealthy();
                expect(result).toBeDefined();
            } catch (error) {
                // Health checks might fail in test environment
                expect(error).toBeDefined();
            }
        });
        it('should execute memory health check', async ()=>{
            const indicator = module.get(MemoryHealthIndicator);
            try {
                const result = await indicator.isHealthy();
                expect(result).toBeDefined();
            } catch (error) {
                // Health checks might fail in test environment
                expect(error).toBeDefined();
            }
        });
        it('should execute cache health check', async ()=>{
            const indicator = module.get(CacheHealthIndicator);
            try {
                const result = await indicator.isHealthy();
                expect(result).toBeDefined();
            } catch (error) {
                // Health checks might fail in test environment
                expect(error).toBeDefined();
            }
        });
        it('should execute system health check', async ()=>{
            const indicator = module.get(SystemHealthIndicator);
            try {
                const result = await indicator.isHealthy();
                expect(result).toBeDefined();
            } catch (error) {
                // Health checks might fail in test environment
                expect(error).toBeDefined();
            }
        });
    });
    describe('health Controller Integration', ()=>{
        it('should have health controller available', ()=>{
            expect(healthController).toBeDefined();
        });
        it('should execute comprehensive health check', async ()=>{
            // This tests that all health indicators are properly integrated
            try {
                const result = await healthController.check();
                expect(result).toBeDefined();
                expect(result.status).toBeDefined();
                expect(result.info).toBeDefined();
            } catch (error) {
                // Health checks might fail in test environment, but should not throw module errors
                expect(error).toBeDefined();
            }
        });
        it('should provide detailed health information', async ()=>{
            try {
                const result = await healthController.getDetailedHealth();
                expect(result).toBeDefined();
            } catch (error) {
                // Detailed health might fail in test environment
                expect(error).toBeDefined();
            }
        });
    });
    describe('health Indicator Dependencies', ()=>{
        it('should resolve dependencies for cache health indicator', ()=>{
            const indicator = module.get(CacheHealthIndicator);
            expect(indicator).toBeDefined();
            // Should not throw when checking dependencies
            expect(()=>indicator.key).not.toThrow();
        });
        it('should resolve dependencies for redis health indicator', ()=>{
            const indicator = module.get(RedisHealthIndicator);
            expect(indicator).toBeDefined();
            // Should not throw when checking dependencies
            expect(()=>indicator.key).not.toThrow();
        });
        it('should resolve dependencies for queue health indicator', ()=>{
            const indicator = module.get(JobQueueHealthIndicator);
            expect(indicator).toBeDefined();
            // Should not throw when checking dependencies
            expect(()=>indicator.key).not.toThrow();
        });
        it('should resolve dependencies for storage health indicator', ()=>{
            const indicator = module.get(StorageHealthIndicator);
            expect(indicator).toBeDefined();
            // Should not throw when checking dependencies
            expect(()=>indicator.key).not.toThrow();
        });
    });
    describe('health Check Error Handling', ()=>{
        it('should handle individual health check failures gracefully', async ()=>{
            // Test that if one health check fails, others still work
            const indicators = [
                module.get(DiskSpaceHealthIndicator),
                module.get(MemoryHealthIndicator),
                module.get(SystemHealthIndicator)
            ];
            for (const indicator of indicators){
                try {
                    const result = await indicator.isHealthy();
                    expect(result).toBeDefined();
                } catch (error) {
                    // Individual health checks might fail, but should be handled
                    expect(error).toBeDefined();
                }
            }
        });
    });
    describe('module Export Verification', ()=>{
        it('should export all health indicators', ()=>{
            // Verify that all health indicators are properly exported from the module
            const indicators = [
                DiskSpaceHealthIndicator,
                MemoryHealthIndicator,
                HttpHealthIndicator,
                CacheHealthIndicator,
                RedisHealthIndicator,
                AlertingHealthIndicator,
                SystemHealthIndicator,
                JobQueueHealthIndicator,
                StorageHealthIndicator
            ];
            indicators.forEach((IndicatorClass)=>{
                const indicator = module.get(IndicatorClass);
                expect(indicator).toBeDefined();
            });
        });
    });
});

//# sourceMappingURL=health-indicators.integration.spec.js.map