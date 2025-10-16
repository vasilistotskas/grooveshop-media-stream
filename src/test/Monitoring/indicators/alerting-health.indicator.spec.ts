import type { Alert } from '#microservice/Monitoring/interfaces/monitoring.interface'
import type { MockedObject } from 'vitest'
import { AlertingHealthIndicator } from '#microservice/Monitoring/indicators/alerting-health.indicator'
import { AlertSeverity } from '#microservice/Monitoring/interfaces/monitoring.interface'
import { AlertService } from '#microservice/Monitoring/services/alert.service'
import { HealthIndicatorService } from '@nestjs/terminus'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('alertingHealthIndicator', () => {
	let indicator: AlertingHealthIndicator
	let alertService: MockedObject<AlertService>

	const mockAlertStats = {
		totalRules: 5,
		activeAlerts: 2,
		alertsBySeverity: {
			[AlertSeverity.LOW]: 0,
			[AlertSeverity.MEDIUM]: 1,
			[AlertSeverity.HIGH]: 1,
			[AlertSeverity.CRITICAL]: 0,
		},
		alertsLast24h: 3,
		averageResolutionTime: 300000,
	}

	const mockActiveAlerts: Alert[] = [
		{
			id: 'alert-1',
			ruleId: 'rule-1',
			ruleName: 'High Memory Usage',
			message: 'Memory usage is above threshold',
			severity: AlertSeverity.HIGH,
			timestamp: Date.now(),
			resolved: false,
		},
		{
			id: 'alert-2',
			ruleId: 'rule-2',
			ruleName: 'Slow Response Time',
			message: 'Response time is above threshold',
			severity: AlertSeverity.MEDIUM,
			timestamp: Date.now(),
			resolved: false,
		},
	]

	const mockCriticalAlerts: Alert[] = [
		{
			id: 'critical-alert-1',
			ruleId: 'critical-rule-1',
			ruleName: 'Critical Memory Usage',
			message: 'Memory usage is critically high',
			severity: AlertSeverity.CRITICAL,
			timestamp: Date.now(),
			resolved: false,
		},
	]

	beforeEach(async () => {
		const mockAlertService = {
			getAlertStats: vi.fn().mockReturnValue(mockAlertStats),
			getActiveAlerts: vi.fn().mockReturnValue(mockActiveAlerts),
			getAlertHistory: vi.fn().mockReturnValue([]),
		}

		const mockHealthIndicatorService = {
			check: vi.fn(key => ({
				up: vi.fn(details => ({
					[key]: {
						status: 'up',
						...details,
					},
				})),
				down: vi.fn(details => ({
					[key]: {
						status: 'down',
						...details,
					},
				})),
			})),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AlertingHealthIndicator,
				{ provide: AlertService, useValue: mockAlertService },
				{ provide: HealthIndicatorService, useValue: mockHealthIndicatorService },
			],
		}).compile()

		indicator = module.get<AlertingHealthIndicator>(AlertingHealthIndicator)
		alertService = module.get(AlertService)
	})

	it('should be defined', () => {
		expect(indicator).toBeDefined()
	})

	describe('isHealthy', () => {
		it('should return healthy status when no critical alerts', async () => {
			const result = await indicator.isHealthy()

			expect(result).toHaveProperty('alerting')
			expect(result.alerting.status).toBe('up')
			expect(result.alerting).toHaveProperty('totalRules', 5)
			expect(result.alerting).toHaveProperty('activeAlerts', 2)
			expect(result.alerting).toHaveProperty('criticalAlerts', 0)
			expect(result.alerting).toHaveProperty('highAlerts', 1)
		})

		it('should return unhealthy status when critical alerts exist', async () => {
			const criticalAlertStats = {
				...mockAlertStats,
				alertsBySeverity: {
					...mockAlertStats.alertsBySeverity,
					[AlertSeverity.CRITICAL]: 1,
				},
			}

			alertService.getAlertStats.mockReturnValue(criticalAlertStats)
			alertService.getActiveAlerts.mockReturnValue(mockCriticalAlerts)

			const result = await indicator.isHealthy()
			expect(result.alerting.status).toBe('down')
			expect(result.alerting.message).toContain('critical alerts active')
		})

		it('should return unhealthy status when too many high alerts', async () => {
			const manyHighAlerts: Alert[] = [
				...mockActiveAlerts,
				{
					id: 'high-alert-2',
					ruleId: 'high-rule-2',
					ruleName: 'High CPU Usage',
					message: 'CPU usage is high',
					severity: AlertSeverity.HIGH,
					timestamp: Date.now(),
					resolved: false,
				},
				{
					id: 'high-alert-3',
					ruleId: 'high-rule-3',
					ruleName: 'High Disk Usage',
					message: 'Disk usage is high',
					severity: AlertSeverity.HIGH,
					timestamp: Date.now(),
					resolved: false,
				},
			]

			const highAlertStats = {
				...mockAlertStats,
				activeAlerts: 4,
				alertsBySeverity: {
					...mockAlertStats.alertsBySeverity,
					[AlertSeverity.HIGH]: 3,
				},
			}

			alertService.getAlertStats.mockReturnValue(highAlertStats)
			alertService.getActiveAlerts.mockReturnValue(manyHighAlerts)

			const result = await indicator.isHealthy()
			expect(result.alerting.status).toBe('down')
			expect(result.alerting.message).toContain('high severity alerts active')
		})

		it('should use custom key', async () => {
			const result = await indicator.isHealthy('custom-alerting')

			expect(result).toHaveProperty('custom-alerting')
		})

		it('should handle alerting service errors', async () => {
			alertService.getAlertStats.mockImplementation(() => {
				throw new Error('Alert service unavailable')
			})

			const result = await indicator.isHealthy()
			expect(result.alerting.status).toBe('down')
			expect(result.alerting.message).toBe('Alerting health check failed')
		})

		it('should include recent critical alerts in response', async () => {
			alertService.getActiveAlerts.mockReturnValue(mockCriticalAlerts)

			const result = await indicator.isHealthy()
			expect(result.alerting.status).toBe('down')
			expect(result.alerting.message).toContain('critical alerts active')
			expect(result.alerting.recentCriticalAlerts).toBeDefined()
		})
	})

	describe('getDetailedStatus', () => {
		it('should return detailed status for healthy alerting system', async () => {
			const result = await indicator.getDetailedStatus()

			expect(result.healthy).toBe(true)
			expect(result.alertStats).toEqual(mockAlertStats)
			expect(result.activeAlerts).toEqual(mockActiveAlerts)
			expect(result.recentAlerts).toEqual([])
		})

		it('should return detailed status for unhealthy alerting system', async () => {
			alertService.getActiveAlerts.mockReturnValue(mockCriticalAlerts)

			const result = await indicator.getDetailedStatus()

			expect(result.healthy).toBe(false)
			expect(result.activeAlerts).toEqual(mockCriticalAlerts)
		})

		it('should handle errors gracefully', async () => {
			alertService.getAlertStats.mockImplementation(() => {
				throw new Error('Service error')
			})

			const result = await indicator.getDetailedStatus()

			expect(result.healthy).toBe(false)
			expect(result.alertStats).toBeNull()
			expect(result.activeAlerts).toEqual([])
			expect(result.recentAlerts).toEqual([])
		})

		it('should include recent alerts in detailed status', async () => {
			const recentAlerts = [
				{
					id: 'recent-1',
					ruleId: 'rule-1',
					ruleName: 'Recent Alert',
					message: 'Recent alert message',
					severity: AlertSeverity.MEDIUM,
					timestamp: Date.now() - 60000,
					resolved: true,
					resolvedAt: Date.now() - 30000,
				},
			]

			alertService.getAlertHistory.mockReturnValue(recentAlerts)

			const result = await indicator.getDetailedStatus()

			expect(result.recentAlerts).toHaveLength(1)
			expect(result.recentAlerts[0]).toEqual(recentAlerts[0])
		})
	})

	describe('getAlertSeverityDistribution', () => {
		it('should return alert severity distribution', () => {
			const distribution = indicator.getAlertSeverityDistribution()

			expect(distribution).toEqual(mockAlertStats.alertsBySeverity)
		})
	})

	describe('checkAlertingSystem', () => {
		it('should check alerting system functionality', async () => {
			const result = await indicator.checkAlertingSystem()

			expect(result.rulesConfigured).toBe(true)
			expect(result.alertsProcessing).toBe(true)
			expect(result.recentActivity).toBe(true) // Has active alerts in mock
		})

		it('should detect recent activity', async () => {
			const recentAlerts = [
				{
					id: 'recent-1',
					ruleId: 'rule-1',
					ruleName: 'Recent Alert',
					message: 'Recent alert message',
					severity: AlertSeverity.MEDIUM,
					timestamp: Date.now() - 30000,
					resolved: false,
				},
			]

			alertService.getAlertHistory.mockReturnValue(recentAlerts)

			const result = await indicator.checkAlertingSystem()

			expect(result.recentActivity).toBe(true)
		})

		it('should detect when no rules are configured', async () => {
			alertService.getAlertStats.mockReturnValue({
				...mockAlertStats,
				totalRules: 0,
			})

			const result = await indicator.checkAlertingSystem()

			expect(result.rulesConfigured).toBe(false)
		})
	})

	describe('getDescription', () => {
		it('should return indicator description', () => {
			const description = indicator.getDescription()

			expect(description).toBeTruthy()
			expect(description).toContain('alerting system')
		})
	})

	describe('key property', () => {
		it('should return correct key', () => {
			expect(indicator.key).toBe('alerting')
		})
	})

	describe('edge cases', () => {
		it('should handle empty active alerts', async () => {
			alertService.getActiveAlerts.mockReturnValue([])
			alertService.getAlertStats.mockReturnValue({
				...mockAlertStats,
				activeAlerts: 0,
				alertsBySeverity: {
					[AlertSeverity.LOW]: 0,
					[AlertSeverity.MEDIUM]: 0,
					[AlertSeverity.HIGH]: 0,
					[AlertSeverity.CRITICAL]: 0,
				},
			})

			const result = await indicator.isHealthy()

			expect(result.alerting.status).toBeTruthy()
			expect(result.alerting.activeAlerts).toBe(0)
			expect(result.alerting.criticalAlerts).toBe(0)
		})

		it('should handle exactly 3 high alerts (boundary case)', async () => {
			const threeHighAlerts: Alert[] = [
				{
					id: 'high-1',
					ruleId: 'rule-1',
					ruleName: 'High Alert 1',
					message: 'High alert 1',
					severity: AlertSeverity.HIGH,
					timestamp: Date.now(),
					resolved: false,
				},
				{
					id: 'high-2',
					ruleId: 'rule-2',
					ruleName: 'High Alert 2',
					message: 'High alert 2',
					severity: AlertSeverity.HIGH,
					timestamp: Date.now(),
					resolved: false,
				},
				{
					id: 'high-3',
					ruleId: 'rule-3',
					ruleName: 'High Alert 3',
					message: 'High alert 3',
					severity: AlertSeverity.HIGH,
					timestamp: Date.now(),
					resolved: false,
				},
			]

			alertService.getActiveAlerts.mockReturnValue(threeHighAlerts)

			// Should be unhealthy with exactly 3 high alerts (threshold is < 3)
			const result = await indicator.isHealthy()
			expect(result.alerting.status).toBe('down')
		})
	})
})
