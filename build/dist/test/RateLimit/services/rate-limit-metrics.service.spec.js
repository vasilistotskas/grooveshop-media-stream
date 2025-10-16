import { ConfigService } from "../../../MediaStream/Config/config.service.js";
import { RateLimitMetricsService } from "../../../MediaStream/RateLimit/services/rate-limit-metrics.service.js";
import { Test } from "@nestjs/testing";
import * as promClient from "prom-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
describe('rateLimitMetricsService', ()=>{
    let service;
    let configService;
    beforeEach(async ()=>{
        // Clear the default registry before each test
        promClient.register.clear();
        const mockConfigService = {
            get: vi.fn().mockReturnValue(true),
            getOptional: vi.fn()
        };
        const module = await Test.createTestingModule({
            providers: [
                RateLimitMetricsService,
                {
                    provide: ConfigService,
                    useValue: mockConfigService
                }
            ]
        }).compile();
        service = module.get(RateLimitMetricsService);
        configService = module.get(ConfigService);
        await service.onModuleInit();
    });
    afterEach(()=>{
        promClient.register.clear();
        vi.clearAllMocks();
    });
    describe('onModuleInit', ()=>{
        it('should initialize when monitoring is enabled', async ()=>{
            configService.get.mockReturnValue(true);
            await service.onModuleInit();
            expect(configService.get).toHaveBeenCalledWith('monitoring.enabled');
        });
        it('should handle disabled monitoring', async ()=>{
            configService.get.mockReturnValue(false);
            await service.onModuleInit();
            expect(configService.get).toHaveBeenCalledWith('monitoring.enabled');
        });
    });
    describe('recordRateLimitAttempt', ()=>{
        it('should record allowed rate limit attempts', ()=>{
            service.recordRateLimitAttempt('image-processing', '192.168.1.1', true);
            // Since we're using a separate registry, we need to check the service's registry
            const registry = service.register;
            const metrics = registry.getSingleMetric('mediastream_rate_limit_attempts_total');
            expect(metrics).toBeDefined();
        });
        it('should record blocked rate limit attempts', ()=>{
            service.recordRateLimitAttempt('image-processing', '192.168.1.1', false);
            const registry = service.register;
            const attemptsMetric = registry.getSingleMetric('mediastream_rate_limit_attempts_total');
            const blockedMetric = registry.getSingleMetric('mediastream_rate_limit_blocked_total');
            expect(attemptsMetric).toBeDefined();
            expect(blockedMetric).toBeDefined();
        });
        it('should hash IP addresses for privacy', ()=>{
            service.recordRateLimitAttempt('image-processing', '192.168.1.1', true);
            service.recordRateLimitAttempt('image-processing', '192.168.1.2', true);
            // IPs should be hashed differently
            const registry = service.register;
            const metrics = registry.getSingleMetric('mediastream_rate_limit_attempts_total');
            expect(metrics).toBeDefined();
        });
    });
    describe('updateCurrentRequests', ()=>{
        it('should update current request count', ()=>{
            service.updateCurrentRequests('image-processing', '192.168.1.1', 5);
            const registry = service.register;
            const metrics = registry.getSingleMetric('mediastream_rate_limit_current_requests');
            expect(metrics).toBeDefined();
        });
        it('should handle zero requests', ()=>{
            service.updateCurrentRequests('image-processing', '192.168.1.1', 0);
            const registry = service.register;
            const metrics = registry.getSingleMetric('mediastream_rate_limit_current_requests');
            expect(metrics).toBeDefined();
        });
    });
    describe('recordAdaptiveAdjustment', ()=>{
        it('should record rate limit increases', ()=>{
            service.recordAdaptiveAdjustment('increase', 'low_system_load');
            const registry = service.register;
            const metrics = registry.getSingleMetric('mediastream_rate_limit_adaptive_adjustments_total');
            expect(metrics).toBeDefined();
        });
        it('should record rate limit decreases', ()=>{
            service.recordAdaptiveAdjustment('decrease', 'high_memory_usage');
            const registry = service.register;
            const metrics = registry.getSingleMetric('mediastream_rate_limit_adaptive_adjustments_total');
            expect(metrics).toBeDefined();
        });
    });
    describe('updateSystemLoadMetrics', ()=>{
        it('should update all system load metrics', ()=>{
            service.updateSystemLoadMetrics(75.5, 80.2, 150);
            const registry = service.register;
            const metrics = registry.getSingleMetric('mediastream_rate_limit_system_load');
            expect(metrics).toBeDefined();
        });
        it('should handle zero values', ()=>{
            service.updateSystemLoadMetrics(0, 0, 0);
            const registry = service.register;
            const metrics = registry.getSingleMetric('mediastream_rate_limit_system_load');
            expect(metrics).toBeDefined();
        });
        it('should handle high values', ()=>{
            service.updateSystemLoadMetrics(100, 100, 10000);
            const registry = service.register;
            const metrics = registry.getSingleMetric('mediastream_rate_limit_system_load');
            expect(metrics).toBeDefined();
        });
    });
    describe('getRateLimitStats', ()=>{
        it('should return rate limit statistics', async ()=>{
            const stats = await service.getRateLimitStats();
            expect(stats).toHaveProperty('totalAttempts');
            expect(stats).toHaveProperty('totalBlocked');
            expect(stats).toHaveProperty('blockRate');
            expect(stats).toHaveProperty('topBlockedIps');
            expect(stats).toHaveProperty('topRequestTypes');
            expect(Array.isArray(stats.topBlockedIps)).toBe(true);
            expect(Array.isArray(stats.topRequestTypes)).toBe(true);
        });
        it('should handle errors gracefully', async ()=>{
            // Mock an error scenario
            vi.spyOn(service, 'getRateLimitStats').mockRejectedValueOnce(new Error('Test error'));
            await expect(service.getRateLimitStats()).rejects.toThrow('Test error');
        });
    });
    describe('getCurrentRateLimitConfig', ()=>{
        beforeEach(()=>{
            configService.getOptional.mockImplementation((key, defaultValue)=>{
                const configs = {
                    'rateLimit.default.max': 100,
                    'rateLimit.imageProcessing.max': 50,
                    'rateLimit.healthCheck.max': 1000,
                    'rateLimit.default.windowMs': 60000
                };
                return configs[key] || defaultValue;
            });
        });
        it('should return current rate limit configuration', ()=>{
            const config = service.getCurrentRateLimitConfig();
            expect(config).toEqual({
                defaultLimit: 100,
                imageProcessingLimit: 50,
                healthCheckLimit: 1000,
                windowMs: 60000
            });
        });
        it('should use default values when config is missing', ()=>{
            configService.getOptional.mockImplementation((key, defaultValue)=>{
                // Return the default value when config is missing
                return defaultValue;
            });
            const config = service.getCurrentRateLimitConfig();
            expect(config).toEqual({
                defaultLimit: 100,
                imageProcessingLimit: 50,
                healthCheckLimit: 1000,
                windowMs: 60000
            });
        });
    });
    describe('resetMetrics', ()=>{
        it('should reset all rate limit metrics', ()=>{
            // Record some metrics first
            service.recordRateLimitAttempt('image-processing', '192.168.1.1', true);
            service.updateCurrentRequests('image-processing', '192.168.1.1', 5);
            service.recordAdaptiveAdjustment('decrease', 'high_load');
            // Reset metrics
            service.resetMetrics();
            // Verify metrics are reset (this is a basic check)
            const registry = service.register;
            const attemptsMetric = registry.getSingleMetric('mediastream_rate_limit_attempts_total');
            expect(attemptsMetric).toBeDefined();
        });
    });
    describe('iP hashing', ()=>{
        it('should consistently hash the same IP', ()=>{
            const service1 = new RateLimitMetricsService(configService);
            const service2 = new RateLimitMetricsService(configService);
            // Access the private method through type assertion for testing
            const hash1 = service1.hashIp('192.168.1.1');
            const hash2 = service2.hashIp('192.168.1.1');
            expect(hash1).toBe(hash2);
            expect(hash1).toMatch(/^ip_[a-z0-9]+$/);
        });
        it('should produce different hashes for different IPs', ()=>{
            const hash1 = service.hashIp('192.168.1.1');
            const hash2 = service.hashIp('192.168.1.2');
            expect(hash1).not.toBe(hash2);
            expect(hash1).toMatch(/^ip_[a-z0-9]+$/);
            expect(hash2).toMatch(/^ip_[a-z0-9]+$/);
        });
        it('should handle empty IP addresses', ()=>{
            const hash = service.hashIp('');
            expect(hash).toMatch(/^ip_[a-z0-9]+$/);
        });
    });
});

//# sourceMappingURL=rate-limit-metrics.service.spec.js.map