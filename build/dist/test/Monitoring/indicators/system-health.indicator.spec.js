import { SystemHealthIndicator } from "../../../MediaStream/Monitoring/indicators/system-health.indicator.js";
import { MonitoringService } from "../../../MediaStream/Monitoring/services/monitoring.service.js";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
describe('systemHealthIndicator', ()=>{
    let indicator;
    let monitoringService;
    const mockHealthySystem = {
        status: 'healthy',
        timestamp: Date.now(),
        components: [
            {
                name: 'memory',
                status: 'healthy',
                score: 85,
                metrics: {
                    usagePercent: 65
                },
                lastCheck: Date.now()
            },
            {
                name: 'disk',
                status: 'healthy',
                score: 90,
                metrics: {
                    usagePercent: 45
                },
                lastCheck: Date.now()
            }
        ],
        overallScore: 87.5
    };
    const mockUnhealthySystem = {
        status: 'unhealthy',
        timestamp: Date.now(),
        components: [
            {
                name: 'memory',
                status: 'unhealthy',
                score: 30,
                metrics: {
                    usagePercent: 95
                },
                lastCheck: Date.now()
            }
        ],
        overallScore: 30
    };
    beforeEach(async ()=>{
        const mockMonitoringService = {
            getSystemHealth: vi.fn().mockResolvedValue(mockHealthySystem),
            getStats: vi.fn().mockReturnValue({
                totalMetrics: 100,
                metricTypes: {
                    counter: 50,
                    gauge: 30,
                    timer: 20
                },
                oldestMetric: Date.now() - 86400000,
                newestMetric: Date.now(),
                memoryUsage: 1024000
            })
        };
        const module = await Test.createTestingModule({
            providers: [
                SystemHealthIndicator,
                {
                    provide: MonitoringService,
                    useValue: mockMonitoringService
                }
            ]
        }).compile();
        indicator = module.get(SystemHealthIndicator);
        monitoringService = module.get(MonitoringService);
    });
    it('should be defined', ()=>{
        expect(indicator).toBeDefined();
    });
    describe('isHealthy', ()=>{
        it('should return healthy status for healthy system', async ()=>{
            const result = await indicator.isHealthy();
            expect(result).toHaveProperty('system');
            expect(result.system.status).toBeTruthy();
            expect(result.system).toHaveProperty('overallScore', 87.5);
            expect(result.system).toHaveProperty('components');
        });
        it('should return unhealthy status for unhealthy system', async ()=>{
            monitoringService.getSystemHealth.mockResolvedValue(mockUnhealthySystem);
            const result = await indicator.isHealthy();
            expect(result.system.status).toBe('down');
        });
        it('should use system key', async ()=>{
            const result = await indicator.isHealthy();
            expect(result).toHaveProperty('system');
        });
        it('should handle monitoring service errors', async ()=>{
            monitoringService.getSystemHealth.mockRejectedValue(new Error('Service unavailable'));
            const result = await indicator.isHealthy();
            expect(result.system.status).toBe('down');
        });
    });
    describe('getDetailedStatus', ()=>{
        it('should return detailed status for healthy system', async ()=>{
            const result = await indicator.getDetailedStatus();
            expect(result.healthy).toBe(true);
            expect(result.systemHealth).toEqual(mockHealthySystem);
            expect(result.monitoringStats).toBeDefined();
        });
        it('should return detailed status for unhealthy system', async ()=>{
            monitoringService.getSystemHealth.mockResolvedValue(mockUnhealthySystem);
            const result = await indicator.getDetailedStatus();
            expect(result.healthy).toBe(false);
            expect(result.systemHealth).toEqual(mockUnhealthySystem);
        });
        it('should handle errors gracefully', async ()=>{
            monitoringService.getSystemHealth.mockRejectedValue(new Error('Service error'));
            const result = await indicator.getDetailedStatus();
            expect(result.healthy).toBe(false);
            expect(result.systemHealth).toBeNull();
            expect(result.monitoringStats).toBeNull();
        });
    });
    describe('getComponentHealth', ()=>{
        it('should return specific component health', async ()=>{
            const result = await indicator.getComponentHealth('memory');
            expect(result).toBeDefined();
            expect(result.name).toBe('memory');
            expect(result.status).toBe('healthy');
            expect(result.score).toBe(85);
        });
        it('should return undefined for non-existent component', async ()=>{
            const result = await indicator.getComponentHealth('non-existent');
            expect(result).toBeUndefined();
        });
    });
    describe('getDescription', ()=>{
        it('should return indicator description', ()=>{
            const details = indicator.getDetails();
            const description = details.description;
            expect(description).toBeTruthy();
            expect(description).toContain('system health');
        });
    });
    describe('key property', ()=>{
        it('should return correct key', ()=>{
            expect(indicator.key).toBe('system');
        });
    });
    describe('degraded system status', ()=>{
        it('should handle degraded system status', async ()=>{
            const mockDegradedSystem = {
                status: 'degraded',
                timestamp: Date.now(),
                components: [
                    {
                        name: 'memory',
                        status: 'degraded',
                        score: 65,
                        metrics: {
                            usagePercent: 75
                        },
                        lastCheck: Date.now()
                    }
                ],
                overallScore: 65
            };
            monitoringService.getSystemHealth.mockResolvedValue(mockDegradedSystem);
            const result = await indicator.isHealthy();
            expect(result.system.status).toBe('down');
            const detailedStatus = await indicator.getDetailedStatus();
            expect(detailedStatus.healthy).toBe(false);
            expect(detailedStatus.systemHealth.status).toBe('degraded');
        });
    });
    describe('component status variations', ()=>{
        it('should handle mixed component statuses', async ()=>{
            const mockMixedSystem = {
                status: 'degraded',
                timestamp: Date.now(),
                components: [
                    {
                        name: 'memory',
                        status: 'healthy',
                        score: 85,
                        metrics: {
                            usagePercent: 65
                        },
                        lastCheck: Date.now()
                    },
                    {
                        name: 'disk',
                        status: 'degraded',
                        score: 60,
                        metrics: {
                            usagePercent: 80
                        },
                        lastCheck: Date.now()
                    },
                    {
                        name: 'network',
                        status: 'unhealthy',
                        score: 20,
                        metrics: {
                            latencyMs: 5000
                        },
                        lastCheck: Date.now()
                    }
                ],
                overallScore: 55
            };
            monitoringService.getSystemHealth.mockResolvedValue(mockMixedSystem);
            const result = await indicator.getComponentHealth('network');
            expect(result.status).toBe('unhealthy');
            expect(result.score).toBe(20);
        });
    });
});

//# sourceMappingURL=system-health.indicator.spec.js.map