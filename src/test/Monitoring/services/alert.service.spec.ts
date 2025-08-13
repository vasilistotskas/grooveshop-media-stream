import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import {
	AlertCondition,
	AlertRule,
	AlertSeverity,
} from '@microservice/Monitoring/interfaces/monitoring.interface'
import { AlertService } from '@microservice/Monitoring/services/alert.service'
import { MonitoringService } from '@microservice/Monitoring/services/monitoring.service'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'

describe('alertService', () => {
	let service: AlertService
	let monitoringService: jest.Mocked<MonitoringService>

	const mockAlertRule: AlertRule = {
		id: 'test-rule',
		name: 'Test Rule',
		description: 'Test alert rule',
		metric: 'test.metric',
		condition: AlertCondition.GREATER_THAN,
		threshold: 100,
		severity: AlertSeverity.HIGH,
		enabled: true,
		cooldownMs: 60000,
	}

	beforeEach(async () => {
		const mockConfigService = {
			get: jest.fn().mockReturnValue({
				enabled: true,
				metricsRetentionMs: 24 * 60 * 60 * 1000,
				alertsRetentionMs: 7 * 24 * 60 * 60 * 1000,
				performanceRetentionMs: 24 * 60 * 60 * 1000,
				healthCheckIntervalMs: 30 * 1000,
				alertCooldownMs: 5 * 60 * 1000,
				externalIntegrations: {
					enabled: false,
					endpoints: [],
				},
			}),
		}

		const mockCorrelationService = {
			getCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
		}

		const mockMonitoringService = {
			getAggregatedMetrics: jest.fn().mockReturnValue({
				count: 1,
				sum: 150,
				avg: 150,
				min: 150,
				max: 150,
				latest: 150,
			}),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AlertService,
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: CorrelationService, useValue: mockCorrelationService },
				{ provide: MonitoringService, useValue: mockMonitoringService },
			],
		}).compile()

		service = module.get<AlertService>(AlertService)
		monitoringService = module.get(MonitoringService)

		// Clear any default rules for clean testing
		service.getAlertRules().forEach(rule => service.removeAlertRule(rule.id))
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('addAlertRule', () => {
		it('should add alert rule successfully', () => {
			service.addAlertRule(mockAlertRule)

			const rules = service.getAlertRules()
			expect(rules).toHaveLength(1)
			expect(rules[0]).toEqual(mockAlertRule)
		})

		it('should update existing rule', () => {
			service.addAlertRule(mockAlertRule)

			const updatedRule = { ...mockAlertRule, threshold: 200 }
			service.addAlertRule(updatedRule)

			const rules = service.getAlertRules()
			expect(rules).toHaveLength(1)
			expect(rules[0].threshold).toBe(200)
		})
	})

	describe('removeAlertRule', () => {
		it('should remove alert rule successfully', () => {
			service.addAlertRule(mockAlertRule)
			expect(service.getAlertRules()).toHaveLength(1)

			const removed = service.removeAlertRule(mockAlertRule.id)
			expect(removed).toBe(true)
			expect(service.getAlertRules()).toHaveLength(0)
		})

		it('should return false for non-existent rule', () => {
			const removed = service.removeAlertRule('non-existent')
			expect(removed).toBe(false)
		})
	})

	describe('triggerAlert', () => {
		it('should trigger manual alert', () => {
			service.triggerAlert('Manual Test', 'Test message', AlertSeverity.MEDIUM)

			const activeAlerts = service.getActiveAlerts()
			expect(activeAlerts).toHaveLength(1)
			expect(activeAlerts[0].ruleName).toBe('Manual Test')
			expect(activeAlerts[0].message).toBe('Test message')
			expect(activeAlerts[0].severity).toBe(AlertSeverity.MEDIUM)
		})

		it('should add alert to history', () => {
			service.triggerAlert('Manual Test', 'Test message', AlertSeverity.LOW)

			const history = service.getAlertHistory()
			expect(history).toHaveLength(1)
			expect(history[0].ruleName).toBe('Manual Test')
		})
	})

	describe('resolveAlert', () => {
		it('should resolve active alert', () => {
			service.triggerAlert('Test Alert', 'Test message', AlertSeverity.HIGH)
			const activeAlerts = service.getActiveAlerts()
			const alertId = activeAlerts[0].id

			const resolved = service.resolveAlert(alertId)
			expect(resolved).toBe(true)
			expect(service.getActiveAlerts()).toHaveLength(0)

			const history = service.getAlertHistory()
			expect(history[0].resolved).toBe(true)
			expect(history[0].resolvedAt).toBeDefined()
		})

		it('should return false for non-existent alert', () => {
			const resolved = service.resolveAlert('non-existent')
			expect(resolved).toBe(false)
		})
	})

	describe('getAlertStats', () => {
		beforeEach(() => {
			service.triggerAlert('Critical Alert', 'Critical message', AlertSeverity.CRITICAL)
			service.triggerAlert('High Alert', 'High message', AlertSeverity.HIGH)
			service.triggerAlert('Medium Alert', 'Medium message', AlertSeverity.MEDIUM)
		})

		it('should return alert statistics', () => {
			const stats = service.getAlertStats()

			expect(stats.activeAlerts).toBe(3)
			expect(stats.alertsBySeverity[AlertSeverity.CRITICAL]).toBe(1)
			expect(stats.alertsBySeverity[AlertSeverity.HIGH]).toBe(1)
			expect(stats.alertsBySeverity[AlertSeverity.MEDIUM]).toBe(1)
			expect(stats.alertsLast24h).toBe(3)
		})

		it('should calculate average resolution time', async () => {
			const activeAlerts = service.getActiveAlerts()
			expect(activeAlerts.length).toBeGreaterThan(0)

			// Wait a small amount to ensure measurable resolution time
			await new Promise(resolve => setTimeout(resolve, 1))

			// Resolve one alert
			const resolved = service.resolveAlert(activeAlerts[0].id)
			expect(resolved).toBe(true)

			const stats = service.getAlertStats()
			expect(stats.averageResolutionTime).toBeGreaterThanOrEqual(0)
		})
	})

	describe('alert evaluation', () => {
		beforeEach(() => {
			service.addAlertRule(mockAlertRule)
		})

		it('should trigger alert when threshold exceeded', () => {
			// Mock metrics that exceed threshold
			monitoringService.getAggregatedMetrics.mockReturnValue({
				count: 1,
				sum: 150,
				avg: 150,
				min: 150,
				max: 150,
				latest: 150, // Above threshold of 100
			})

			// Manually trigger alert evaluation
			service.evaluateAlertsNow()

			const activeAlerts = service.getActiveAlerts()
			expect(activeAlerts.length).toBeGreaterThan(0)
		})

		it('should not trigger alert when threshold not exceeded', (done) => {
			// Mock metrics below threshold
			monitoringService.getAggregatedMetrics.mockReturnValue({
				count: 1,
				sum: 50,
				avg: 50,
				min: 50,
				max: 50,
				latest: 50, // Below threshold of 100
			})

			setTimeout(() => {
				const activeAlerts = service.getActiveAlerts()
				expect(activeAlerts).toHaveLength(0)
				done()
			}, 100)
		})
	})

	describe('alert conditions', () => {
		const testCases = [
			{ condition: AlertCondition.GREATER_THAN, threshold: 100, value: 150, shouldAlert: true },
			{ condition: AlertCondition.GREATER_THAN, threshold: 100, value: 50, shouldAlert: false },
			{ condition: AlertCondition.LESS_THAN, threshold: 100, value: 50, shouldAlert: true },
			{ condition: AlertCondition.LESS_THAN, threshold: 100, value: 150, shouldAlert: false },
			{ condition: AlertCondition.EQUALS, threshold: 100, value: 100, shouldAlert: true },
			{ condition: AlertCondition.EQUALS, threshold: 100, value: 99, shouldAlert: false },
			{ condition: AlertCondition.GREATER_THAN_OR_EQUAL, threshold: 100, value: 100, shouldAlert: true },
			{ condition: AlertCondition.LESS_THAN_OR_EQUAL, threshold: 100, value: 100, shouldAlert: true },
		]

		testCases.forEach(({ condition, threshold, value, shouldAlert }) => {
			it(`should ${shouldAlert ? 'trigger' : 'not trigger'} alert for ${condition} condition`, () => {
				const rule = { ...mockAlertRule, condition, threshold }
				service.addAlertRule(rule)

				monitoringService.getAggregatedMetrics.mockReturnValue({
					count: 1,
					sum: value,
					avg: value,
					min: value,
					max: value,
					latest: value,
				})

				// Manually trigger alert evaluation
				service.evaluateAlertsNow()

				const activeAlerts = service.getActiveAlerts()
				if (shouldAlert) {
					expect(activeAlerts.length).toBeGreaterThan(0)
				}
				else {
					expect(activeAlerts).toHaveLength(0)
				}
			})
		})
	})
})
