import type { SystemHealth } from '@microservice/Monitoring/interfaces/monitoring.interface'
import type { MockedObject } from 'vitest'
import { MonitoringController } from '@microservice/Monitoring/controllers/monitoring.controller'
import { AlertCondition, AlertSeverity } from '@microservice/Monitoring/interfaces/monitoring.interface'
import { AlertService } from '@microservice/Monitoring/services/alert.service'
import { MonitoringService } from '@microservice/Monitoring/services/monitoring.service'
import { PerformanceMonitoringService } from '@microservice/Monitoring/services/performance-monitoring.service'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('monitoringController', () => {
	let controller: MonitoringController
	let monitoringService: MockedObject<MonitoringService>
	let alertService: MockedObject<AlertService>
	let performanceService: MockedObject<PerformanceMonitoringService>

	const mockSystemHealth: SystemHealth = {
		status: 'healthy',
		timestamp: Date.now(),
		components: [
			{
				name: 'memory',
				status: 'healthy',
				score: 85,
				metrics: { usagePercent: 65 },
				lastCheck: Date.now(),
			},
		],
		overallScore: 85,
	}

	beforeEach(async () => {
		const mockMonitoringService = {
			getSystemHealth: vi.fn().mockResolvedValue(mockSystemHealth),
			getStats: vi.fn().mockReturnValue({
				totalMetrics: 100,
				metricTypes: { counter: 50, gauge: 30, timer: 20 },
				oldestMetric: Date.now() - 86400000,
				newestMetric: Date.now(),
				memoryUsage: 1024000,
			}),
			getMetrics: vi.fn().mockReturnValue([]),
			getAggregatedMetrics: vi.fn().mockReturnValue({
				count: 10,
				sum: 1000,
				avg: 100,
				min: 50,
				max: 200,
				latest: 150,
			}),
			getMetricNames: vi.fn().mockReturnValue(['metric.one', 'metric.two']),
		}

		const mockAlertService = {
			getAlertStats: vi.fn().mockReturnValue({
				totalRules: 5,
				activeAlerts: 2,
				alertsBySeverity: {
					low: 0,
					medium: 1,
					high: 1,
					critical: 0,
				},
				alertsLast24h: 3,
				averageResolutionTime: 300000,
			}),
			getAlertRules: vi.fn().mockReturnValue([]),
			addAlertRule: vi.fn(),
			getActiveAlerts: vi.fn().mockReturnValue([]),
			getAlertHistory: vi.fn().mockReturnValue([]),
			triggerAlert: vi.fn(),
			resolveAlert: vi.fn().mockReturnValue(true),
		}

		const mockPerformanceService = {
			getPerformanceOverview: vi.fn().mockReturnValue({
				totalOperations: 1000,
				averageResponseTime: 150,
				successRate: 95.5,
				slowestOperations: [],
				mostFrequentOperations: [],
				errorRates: [],
			}),
			getPerformanceMetrics: vi.fn().mockReturnValue([]),
			getPerformanceStats: vi.fn().mockReturnValue({
				totalOperations: 100,
				successfulOperations: 95,
				failedOperations: 5,
				successRate: 95,
				averageDuration: 150,
				minDuration: 50,
				maxDuration: 500,
				p50Duration: 120,
				p95Duration: 300,
				p99Duration: 450,
			}),
			getTrackedOperations: vi.fn().mockReturnValue(['operation1', 'operation2']),
			getActiveOperations: vi.fn().mockReturnValue([]),
		}

		const module: TestingModule = await Test.createTestingModule({
			controllers: [MonitoringController],
			providers: [
				{ provide: MonitoringService, useValue: mockMonitoringService },
				{ provide: AlertService, useValue: mockAlertService },
				{ provide: PerformanceMonitoringService, useValue: mockPerformanceService },
			],
		}).compile()

		controller = module.get<MonitoringController>(MonitoringController)
		monitoringService = module.get(MonitoringService)
		alertService = module.get(AlertService)
		performanceService = module.get(PerformanceMonitoringService)
	})

	it('should be defined', () => {
		expect(controller).toBeDefined()
	})

	describe('getSystemHealth', () => {
		it('should return system health', async () => {
			const result = await controller.getSystemHealth()

			expect(result).toEqual(mockSystemHealth)
			expect(monitoringService.getSystemHealth).toHaveBeenCalled()
		})
	})

	describe('getDashboard', () => {
		it('should return dashboard data', async () => {
			const result = await controller.getDashboard()

			expect(result).toHaveProperty('timestamp')
			expect(result).toHaveProperty('systemHealth')
			expect(result).toHaveProperty('alerts')
			expect(result).toHaveProperty('performance')
			expect(result).toHaveProperty('monitoring')

			expect(monitoringService.getSystemHealth).toHaveBeenCalled()
			expect(alertService.getAlertStats).toHaveBeenCalled()
			expect(performanceService.getPerformanceOverview).toHaveBeenCalled()
			expect(monitoringService.getStats).toHaveBeenCalled()
		})

		it('should use custom time range', async () => {
			const since = '1640995200000' // Jan 1, 2022
			await controller.getDashboard(since)

			expect(performanceService.getPerformanceOverview).toHaveBeenCalledWith(1640995200000)
		})
	})

	describe('getMetrics', () => {
		it('should return metrics by name', () => {
			const result = controller.getMetrics('test.metric')

			expect(result).toHaveProperty('name', 'test.metric')
			expect(result).toHaveProperty('metrics')
			expect(monitoringService.getMetrics).toHaveBeenCalledWith('test.metric', undefined)
		})

		it('should return aggregated metrics when requested', () => {
			controller.getMetrics('test.metric', '1640995200000', 'true')

			expect(monitoringService.getAggregatedMetrics).toHaveBeenCalledWith('test.metric', 1640995200000)
		})

		it('should filter by time range', () => {
			controller.getMetrics('test.metric', '1640995200000')

			expect(monitoringService.getMetrics).toHaveBeenCalledWith('test.metric', 1640995200000)
		})
	})

	describe('getMetricNames', () => {
		it('should return all metric names', () => {
			const result = controller.getMetricNames()

			expect(result).toHaveProperty('metrics')
			expect(monitoringService.getMetricNames).toHaveBeenCalled()
		})
	})

	describe('alert endpoints', () => {
		describe('getAlertRules', () => {
			it('should return alert rules', () => {
				const result = controller.getAlertRules()

				expect(result).toHaveProperty('rules')
				expect(alertService.getAlertRules).toHaveBeenCalled()
			})
		})

		describe('addAlertRule', () => {
			it('should add alert rule', () => {
				const rule = {
					id: 'test-rule',
					name: 'Test Rule',
					description: 'Test description',
					metric: 'test.metric',
					condition: AlertCondition.GREATER_THAN,
					threshold: 100,
					severity: AlertSeverity.HIGH,
					enabled: true,
					cooldownMs: 60000,
				}

				const result = controller.addAlertRule(rule)

				expect(result.success).toBe(true)
				expect(alertService.addAlertRule).toHaveBeenCalledWith(rule)
			})
		})

		describe('getActiveAlerts', () => {
			it('should return active alerts', () => {
				const result = controller.getActiveAlerts()

				expect(result).toHaveProperty('alerts')
				expect(alertService.getActiveAlerts).toHaveBeenCalled()
			})
		})

		describe('getAlertHistory', () => {
			it('should return alert history', () => {
				const result = controller.getAlertHistory()

				expect(result).toHaveProperty('alerts')
				expect(alertService.getAlertHistory).toHaveBeenCalledWith(undefined)
			})

			it('should filter by time range', () => {
				controller.getAlertHistory('1640995200000')

				expect(alertService.getAlertHistory).toHaveBeenCalledWith(1640995200000)
			})
		})

		describe('triggerAlert', () => {
			it('should trigger manual alert', () => {
				const alertData = {
					ruleName: 'Manual Alert',
					message: 'Test message',
					severity: AlertSeverity.MEDIUM,
					metadata: { source: 'manual' },
				}

				const result = controller.triggerAlert(alertData)

				expect(result.success).toBe(true)
				expect(alertService.triggerAlert).toHaveBeenCalledWith(
					'Manual Alert',
					'Test message',
					AlertSeverity.MEDIUM,
					{ source: 'manual' },
				)
			})
		})

		describe('resolveAlert', () => {
			it('should resolve alert', () => {
				const result = controller.resolveAlert('alert-123')

				expect(result.success).toBe(true)
				expect(alertService.resolveAlert).toHaveBeenCalledWith('alert-123')
			})

			it('should handle non-existent alert', () => {
				alertService.resolveAlert.mockReturnValue(false)

				const result = controller.resolveAlert('non-existent')

				expect(result.success).toBe(false)
				expect(result.message).toContain('not found')
			})
		})
	})

	describe('performance endpoints', () => {
		describe('getPerformanceMetrics', () => {
			it('should return performance metrics', () => {
				const result = controller.getPerformanceMetrics('test-operation')

				expect(result).toHaveProperty('operationName', 'test-operation')
				expect(result).toHaveProperty('metrics')
				expect(performanceService.getPerformanceMetrics).toHaveBeenCalledWith('test-operation', undefined)
			})

			it('should return performance stats when requested', () => {
				controller.getPerformanceMetrics('test-operation', undefined, 'true')

				expect(performanceService.getPerformanceStats).toHaveBeenCalledWith('test-operation', undefined)
			})

			it('should filter by time range', () => {
				controller.getPerformanceMetrics('test-operation', '1640995200000')

				expect(performanceService.getPerformanceMetrics).toHaveBeenCalledWith('test-operation', 1640995200000)
			})
		})

		describe('getTrackedOperations', () => {
			it('should return tracked operations', () => {
				const result = controller.getTrackedOperations()

				expect(result).toHaveProperty('operations')
				expect(result).toHaveProperty('activeOperations')
				expect(performanceService.getTrackedOperations).toHaveBeenCalled()
				expect(performanceService.getActiveOperations).toHaveBeenCalled()
			})
		})

		describe('getPerformanceOverview', () => {
			it('should return performance overview', () => {
				controller.getPerformanceOverview()

				expect(performanceService.getPerformanceOverview).toHaveBeenCalledWith(undefined)
			})

			it('should filter by time range', () => {
				controller.getPerformanceOverview('1640995200000')

				expect(performanceService.getPerformanceOverview).toHaveBeenCalledWith(1640995200000)
			})
		})
	})

	describe('getMonitoringStats', () => {
		it('should return monitoring statistics', () => {
			const result = controller.getMonitoringStats()

			expect(result).toHaveProperty('monitoring')
			expect(result).toHaveProperty('alerts')
			expect(monitoringService.getStats).toHaveBeenCalled()
			expect(alertService.getAlertStats).toHaveBeenCalled()
		})
	})
})
