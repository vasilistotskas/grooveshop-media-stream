import { CorrelationService } from "../../../MediaStream/Correlation/services/correlation.service.js";
import { MonitoringService } from "../../../MediaStream/Monitoring/services/monitoring.service.js";
import { PerformanceMonitoringService } from "../../../MediaStream/Monitoring/services/performance-monitoring.service.js";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
describe('performanceMonitoringService', ()=>{
    let service;
    let monitoringService;
    let configService;
    let correlationService;
    beforeEach(async ()=>{
        const mockConfigService = {
            get: vi.fn().mockReturnValue({
                enabled: true,
                metricsRetentionMs: 24 * 60 * 60 * 1000,
                alertsRetentionMs: 7 * 24 * 60 * 60 * 1000,
                performanceRetentionMs: 24 * 60 * 60 * 1000,
                healthCheckIntervalMs: 30 * 1000,
                alertCooldownMs: 5 * 60 * 1000,
                externalIntegrations: {
                    enabled: false,
                    endpoints: []
                }
            })
        };
        const mockCorrelationService = {
            getCorrelationId: vi.fn().mockReturnValue('test-correlation-id')
        };
        const mockMonitoringService = {
            recordTimer: vi.fn(),
            incrementCounter: vi.fn()
        };
        const module = await Test.createTestingModule({
            providers: [
                PerformanceMonitoringService,
                {
                    provide: ConfigService,
                    useValue: mockConfigService
                },
                {
                    provide: CorrelationService,
                    useValue: mockCorrelationService
                },
                {
                    provide: MonitoringService,
                    useValue: mockMonitoringService
                }
            ]
        }).compile();
        service = module.get(PerformanceMonitoringService);
        configService = module.get(ConfigService);
        correlationService = module.get(CorrelationService);
        monitoringService = module.get(MonitoringService);
    });
    it('should be defined', ()=>{
        expect(service).toBeDefined();
    });
    describe('startOperation and endOperation', ()=>{
        it('should track operation duration', async ()=>{
            const operationId = service.startOperation('test-operation', {
                userId: '123'
            });
            expect(operationId).toBeTruthy();
            // Simulate some processing time
            await new Promise((resolve)=>setTimeout(resolve, 10));
            service.endOperation(operationId, true);
            const metrics = service.getPerformanceMetrics('test-operation');
            expect(metrics).toHaveLength(1);
            expect(metrics[0].operationName).toBe('test-operation');
            expect(metrics[0].success).toBe(true);
            expect(metrics[0].duration).toBeGreaterThan(0);
            expect(metrics[0].metadata).toEqual({
                userId: '123'
            });
        });
        it('should handle operation failure', ()=>{
            const operationId = service.startOperation('failing-operation');
            service.endOperation(operationId, false, 'Test error message');
            const metrics = service.getPerformanceMetrics('failing-operation');
            expect(metrics).toHaveLength(1);
            expect(metrics[0].success).toBe(false);
            expect(metrics[0].errorMessage).toBe('Test error message');
        });
        it('should handle non-existent operation ID gracefully', ()=>{
            expect(()=>{
                service.endOperation('non-existent-id', true);
            }).not.toThrow();
        });
        it('should not track when disabled', ()=>{
            configService.get.mockReturnValue({
                enabled: false
            });
            const disabledService = new PerformanceMonitoringService(configService, correlationService, monitoringService);
            const operationId = disabledService.startOperation('test-operation');
            expect(operationId).toBe('');
            disabledService.endOperation(operationId, true);
            const metrics = disabledService.getPerformanceMetrics('test-operation');
            expect(metrics).toHaveLength(0);
        });
    });
    describe('trackOperation', ()=>{
        it('should track synchronous operation', ()=>{
            const result = service.trackOperation('sync-operation', ()=>{
                return 'test-result';
            }, {
                type: 'sync'
            });
            expect(result).toBe('test-result');
            const metrics = service.getPerformanceMetrics('sync-operation');
            expect(metrics).toHaveLength(1);
            expect(metrics[0].success).toBe(true);
            expect(metrics[0].metadata).toEqual({
                type: 'sync'
            });
        });
        it('should track synchronous operation failure', ()=>{
            expect(()=>{
                service.trackOperation('failing-sync-operation', ()=>{
                    throw new Error('Sync operation failed');
                });
            }).toThrow('Sync operation failed');
            const metrics = service.getPerformanceMetrics('failing-sync-operation');
            expect(metrics).toHaveLength(1);
            expect(metrics[0].success).toBe(false);
            expect(metrics[0].errorMessage).toBe('Sync operation failed');
        });
    });
    describe('trackAsyncOperation', ()=>{
        it('should track asynchronous operation', async ()=>{
            const result = await service.trackAsyncOperation('async-operation', async ()=>{
                await new Promise((resolve)=>setTimeout(resolve, 10));
                return 'async-result';
            }, {
                type: 'async'
            });
            expect(result).toBe('async-result');
            const metrics = service.getPerformanceMetrics('async-operation');
            expect(metrics).toHaveLength(1);
            expect(metrics[0].success).toBe(true);
            expect(metrics[0].duration).toBeGreaterThan(5);
            expect(metrics[0].metadata).toEqual({
                type: 'async'
            });
        });
        it('should track asynchronous operation failure', async ()=>{
            await expect(service.trackAsyncOperation('failing-async-operation', async ()=>{
                throw new Error('Async operation failed');
            })).rejects.toThrow('Async operation failed');
            const metrics = service.getPerformanceMetrics('failing-async-operation');
            expect(metrics).toHaveLength(1);
            expect(metrics[0].success).toBe(false);
            expect(metrics[0].errorMessage).toBe('Async operation failed');
        });
    });
    describe('getPerformanceStats', ()=>{
        beforeEach(()=>{
            // Add some test performance data
            const op1 = service.startOperation('test-stats');
            // Add a small delay to ensure duration > 0
            const startTime = Date.now();
            while(Date.now() - startTime < 1){}
            service.endOperation(op1, true);
            const op2 = service.startOperation('test-stats');
            const startTime2 = Date.now();
            while(Date.now() - startTime2 < 1){}
            service.endOperation(op2, true);
            const op3 = service.startOperation('test-stats');
            const startTime3 = Date.now();
            while(Date.now() - startTime3 < 1){}
            service.endOperation(op3, false, 'Test error');
        });
        it('should return performance statistics', ()=>{
            const stats = service.getPerformanceStats('test-stats');
            expect(stats.totalOperations).toBe(3);
            expect(stats.successfulOperations).toBe(2);
            expect(stats.failedOperations).toBe(1);
            expect(stats.successRate).toBeCloseTo(66.67, 1);
            expect(stats.averageDuration).toBeGreaterThan(0);
            expect(stats.minDuration).toBeGreaterThan(0);
            expect(stats.maxDuration).toBeGreaterThan(0);
        });
        it('should return empty stats for non-existent operation', ()=>{
            const stats = service.getPerformanceStats('non-existent');
            expect(stats.totalOperations).toBe(0);
            expect(stats.successfulOperations).toBe(0);
            expect(stats.failedOperations).toBe(0);
            expect(stats.successRate).toBe(0);
            expect(stats.averageDuration).toBe(0);
        });
        it('should filter by time range', ()=>{
            const futureTime = Date.now() + 60000;
            const stats = service.getPerformanceStats('test-stats', futureTime);
            expect(stats.totalOperations).toBe(0);
        });
    });
    describe('getActiveOperations', ()=>{
        it('should return active operations', async ()=>{
            const op1 = service.startOperation('active-op-1', {
                user: 'test1'
            });
            const op2 = service.startOperation('active-op-2', {
                user: 'test2'
            });
            // Wait a bit to ensure duration > 0
            await new Promise((resolve)=>setTimeout(resolve, 10));
            const activeOps = service.getActiveOperations();
            expect(activeOps).toHaveLength(2);
            const op1Data = activeOps.find((op)=>op.operationId === op1);
            expect(op1Data).toBeDefined();
            expect(op1Data.operationName).toBe('active-op-1');
            expect(op1Data.metadata).toEqual({
                user: 'test1'
            });
            expect(op1Data.duration).toBeGreaterThan(0);
            // End one operation
            service.endOperation(op1, true);
            const remainingOps = service.getActiveOperations();
            expect(remainingOps).toHaveLength(1);
            expect(remainingOps[0].operationId).toBe(op2);
        });
    });
    describe('getPerformanceOverview', ()=>{
        beforeEach(()=>{
            // Create diverse performance data
            service.trackOperation('fast-operation', ()=>'result');
            service.trackOperation('slow-operation', ()=>{
                // Simulate slow operation
                const start = Date.now();
                while(Date.now() - start < 50){}
                return 'result';
            });
            try {
                service.trackOperation('error-operation', ()=>{
                    throw new Error('Test error');
                });
            } catch (e) {
                const error = e;
                console.error(`Error tracking operation: ${error.message}, ${error}`);
            }
        });
        it('should return performance overview', ()=>{
            const overview = service.getPerformanceOverview();
            expect(overview.totalOperations).toBe(3);
            expect(overview.averageResponseTime).toBeGreaterThan(0);
            expect(overview.successRate).toBeCloseTo(66.67, 1);
            expect(overview.slowestOperations).toBeDefined();
            expect(overview.mostFrequentOperations).toBeDefined();
            expect(overview.errorRates).toBeDefined();
        });
        it('should sort operations correctly', ()=>{
            const overview = service.getPerformanceOverview();
            // Should have slow-operation as slowest
            expect(overview.slowestOperations[0].name).toBe('slow-operation');
            // Should have error-operation in error rates
            const errorOp = overview.errorRates.find((op)=>op.name === 'error-operation');
            expect(errorOp).toBeDefined();
            expect(errorOp.errorRate).toBe(100);
        });
    });
    describe('getTrackedOperations', ()=>{
        it('should return list of tracked operation names', ()=>{
            service.trackOperation('operation-1', ()=>'result');
            service.trackOperation('operation-2', ()=>'result');
            const operations = service.getTrackedOperations();
            expect(operations).toContain('operation-1');
            expect(operations).toContain('operation-2');
            expect(operations).toHaveLength(2);
        });
    });
    describe('integration with MonitoringService', ()=>{
        it('should record metrics to monitoring service', ()=>{
            const operationId = service.startOperation('monitored-operation');
            service.endOperation(operationId, true);
            expect(monitoringService.recordTimer).toHaveBeenCalledWith('performance.monitored-operation.duration', expect.any(Number));
            expect(monitoringService.incrementCounter).toHaveBeenCalledWith('performance.monitored-operation.total');
            expect(monitoringService.incrementCounter).toHaveBeenCalledWith('performance.monitored-operation.success');
        });
        it('should record error metrics', ()=>{
            const operationId = service.startOperation('error-operation');
            service.endOperation(operationId, false, 'Test error');
            expect(monitoringService.incrementCounter).toHaveBeenCalledWith('performance.error-operation.error');
        });
    });
});

//# sourceMappingURL=performance-monitoring.service.spec.js.map