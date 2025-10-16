import { CorrelationModule } from '@microservice/Correlation/correlation.module'
import { MetricsModule } from '@microservice/Metrics/metrics.module'
import { MonitoringController } from '@microservice/Monitoring/controllers/monitoring.controller'
import {
	AlertCondition,
	AlertSeverity,
} from '@microservice/Monitoring/interfaces/monitoring.interface'
import { MonitoringModule } from '@microservice/Monitoring/monitoring.module'
import { AlertService } from '@microservice/Monitoring/services/alert.service'
import { MonitoringService } from '@microservice/Monitoring/services/monitoring.service'
import { PerformanceMonitoringService } from '@microservice/Monitoring/services/performance-monitoring.service'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('monitoring Integration', () => {
	let app: TestingModule
	let monitoringService: MonitoringService
	let alertService: AlertService
	let performanceService: PerformanceMonitoringService
	let controller: MonitoringController

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [
				ConfigModule.forRoot({
					isGlobal: true,
					load: [
						() => ({
							monitoring: {
								enabled: true,
								metricsRetentionMs: 60000, // 1 minute for testing
								alertsRetentionMs: 300000, // 5 minutes for testing
								performanceRetentionMs: 60000,
								healthCheckIntervalMs: 1000, // 1 second for testing
								alertCooldownMs: 5000, // 5 seconds for testing
								externalIntegrations: {
									enabled: false,
									endpoints: [],
								},
							},
						}),
					],
				}),
				CorrelationModule,
				MetricsModule,
				MonitoringModule,
			],
		}).compile()

		monitoringService = app.get<MonitoringService>(MonitoringService)
		alertService = app.get<AlertService>(AlertService)
		performanceService = app.get<PerformanceMonitoringService>(PerformanceMonitoringService)
		controller = app.get<MonitoringController>(MonitoringController)
	})

	afterAll(async () => {
		await app.close()
	})

	describe('end-to-End Monitoring Flow', () => {
		it('should record metrics and trigger alerts', async () => {
			// 1. Record some metrics
			monitoringService.recordGauge('test.cpu.usage', 85)
			monitoringService.recordGauge('test.memory.usage', 95)
			monitoringService.incrementCounter('test.requests.total', 100)
			monitoringService.recordTimer('test.response.time', 250)

			// 2. Verify metrics are recorded
			const cpuMetrics = monitoringService.getMetrics('test.cpu.usage')
			expect(cpuMetrics).toHaveLength(1)
			expect(cpuMetrics[0].value).toBe(85)

			const aggregatedRequests = monitoringService.getAggregatedMetrics('test.requests.total', 0)
			expect(aggregatedRequests.sum).toBe(100)

			// 3. Add alert rule
			alertService.addAlertRule({
				id: 'high-cpu-test',
				name: 'High CPU Usage Test',
				description: 'CPU usage above 80%',
				metric: 'test.cpu.usage',
				condition: AlertCondition.GREATER_THAN,
				threshold: 80,
				severity: AlertSeverity.HIGH,
				enabled: true,
				cooldownMs: 1000,
			})

			// 4. Manually trigger alert evaluation
			alertService.evaluateAlertsNow()

			// 5. Check if alert was triggered
			const activeAlerts = alertService.getActiveAlerts()
			expect(activeAlerts.length).toBeGreaterThan(0)

			const cpuAlert = activeAlerts.find(alert => alert.ruleId === 'high-cpu-test')
			expect(cpuAlert).toBeDefined()
			expect(cpuAlert!.severity).toBe(AlertSeverity.HIGH)
		})

		it('should track performance operations end-to-end', async () => {
			// 1. Track a successful operation
			const result1 = await performanceService.trackAsyncOperation('image-processing', async () => {
				await new Promise(resolve => setTimeout(resolve, 100))
				return 'processed-image.jpg'
			}, { imageSize: '1024x768' })

			expect(result1).toBe('processed-image.jpg')

			// 2. Track a failed operation
			try {
				await performanceService.trackAsyncOperation('image-processing', async () => {
					throw new Error('Processing failed')
				})
			}
			catch (error: unknown) {
				expect((error as Error).message).toBe('Processing failed')
			}

			// 3. Get performance statistics
			const stats = performanceService.getPerformanceStats('image-processing')
			expect(stats.totalOperations).toBe(2)
			expect(stats.successfulOperations).toBe(1)
			expect(stats.failedOperations).toBe(1)
			expect(stats.successRate).toBe(50)
			expect(stats.averageDuration).toBeGreaterThanOrEqual(25)
		})

		it('should provide comprehensive system health', async () => {
			// 1. Record various system metrics
			monitoringService.recordGauge('system.memory.usage_percent', 75)
			monitoringService.recordGauge('cache.hit_rate', 85)
			monitoringService.incrementCounter('cache.hits', 850)
			monitoringService.incrementCounter('cache.misses', 150)

			// 2. Get system health
			const systemHealth = await monitoringService.getSystemHealth()

			expect(systemHealth.status).toMatch(/healthy|degraded|unhealthy/)
			expect(systemHealth.components).toHaveLength(4) // memory, disk, network, cache
			expect(systemHealth.overallScore).toBeGreaterThan(0)

			// 3. Check individual components
			const memoryComponent = systemHealth.components.find(c => c.name === 'memory')
			expect(memoryComponent).toBeDefined()
			expect(memoryComponent!.metrics).toHaveProperty('usagePercent')

			const cacheComponent = systemHealth.components.find(c => c.name === 'cache')
			expect(cacheComponent).toBeDefined()
			expect(cacheComponent!.metrics).toHaveProperty('hitRate')
		})
	})

	describe('controller Integration', () => {
		it('should provide dashboard data', async () => {
			// 1. Generate some activity
			monitoringService.recordGauge('dashboard.test.metric', 42)
			performanceService.trackOperation('dashboard-operation', () => 'result')
			alertService.triggerAlert('Dashboard Test', 'Test alert for dashboard', AlertSeverity.MEDIUM)

			// 2. Get dashboard data
			const dashboard = await controller.getDashboard()

			expect(dashboard).toHaveProperty('timestamp')
			expect(dashboard).toHaveProperty('systemHealth')
			expect(dashboard).toHaveProperty('alerts')
			expect(dashboard).toHaveProperty('performance')
			expect(dashboard).toHaveProperty('monitoring')

			// 3. Verify dashboard content
			expect(dashboard.systemHealth.status).toMatch(/healthy|degraded|unhealthy/)
			expect(dashboard.alerts.activeAlerts.length).toBeGreaterThan(0)
			expect(dashboard.performance.totalOperations).toBeGreaterThan(0)
			expect(dashboard.monitoring.totalMetrics).toBeGreaterThan(0)
		})

		it('should handle metric queries', () => {
			// 1. Record test metrics
			monitoringService.recordHistogram('api.response.size', 1024)
			monitoringService.recordHistogram('api.response.size', 2048)
			monitoringService.recordHistogram('api.response.size', 512)

			// 2. Query metrics
			const metrics = controller.getMetrics('api.response.size')
			expect((metrics as any).name).toBe('api.response.size')
			expect((metrics as any).metrics).toHaveLength(3)

			// 3. Query aggregated metrics
			const aggregated = controller.getMetrics('api.response.size', '0', 'true')
			expect((aggregated as any).count).toBe(3)
			expect((aggregated as any).sum).toBe(3584)
			expect((aggregated as any).avg).toBeCloseTo(1194.67, 1)
		})

		it('should manage alert rules through controller', () => {
			// 1. Add alert rule via controller
			const ruleResponse = controller.addAlertRule({
				id: 'controller-test-rule',
				name: 'Controller Test Rule',
				description: 'Test rule added via controller',
				metric: 'controller.test.metric',
				condition: AlertCondition.GREATER_THAN,
				threshold: 100,
				severity: AlertSeverity.MEDIUM,
				enabled: true,
				cooldownMs: 60000,
			})

			expect(ruleResponse.success).toBe(true)

			// 2. Verify rule was added
			const rules = controller.getAlertRules()
			const addedRule = rules.rules.find(r => r.id === 'controller-test-rule')
			expect(addedRule).toBeDefined()
			expect(addedRule!.name).toBe('Controller Test Rule')

			// 3. Trigger manual alert
			const alertResponse = controller.triggerAlert({
				ruleName: 'Manual Controller Alert',
				message: 'Manually triggered alert',
				severity: AlertSeverity.HIGH,
				metadata: { source: 'controller-test' },
			})

			expect(alertResponse.success).toBe(true)

			// 4. Verify alert was created
			const activeAlerts = controller.getActiveAlerts()
			const manualAlert = activeAlerts.alerts.find(a => a.ruleName === 'Manual Controller Alert')
			expect(manualAlert).toBeDefined()
			expect(manualAlert!.severity).toBe(AlertSeverity.HIGH)

			// 5. Resolve alert
			const resolveResponse = controller.resolveAlert(manualAlert!.id)
			expect(resolveResponse.success).toBe(true)
		})
	})

	describe('performance Monitoring Integration', () => {
		it('should track multiple concurrent operations', async () => {
			const operations = [
				performanceService.trackAsyncOperation('concurrent-op-1', async () => {
					await new Promise(resolve => setTimeout(resolve, 50))
					return 'result-1'
				}),
				performanceService.trackAsyncOperation('concurrent-op-2', async () => {
					await new Promise(resolve => setTimeout(resolve, 75))
					return 'result-2'
				}),
				performanceService.trackAsyncOperation('concurrent-op-3', async () => {
					await new Promise(resolve => setTimeout(resolve, 25))
					return 'result-3'
				}),
			]

			const results = await Promise.all(operations)
			expect(results).toEqual(['result-1', 'result-2', 'result-3'])

			// Check that all operations were tracked
			const trackedOps = performanceService.getTrackedOperations()
			expect(trackedOps).toContain('concurrent-op-1')
			expect(trackedOps).toContain('concurrent-op-2')
			expect(trackedOps).toContain('concurrent-op-3')

			// Verify performance overview
			const overview = performanceService.getPerformanceOverview()
			expect(overview.totalOperations).toBeGreaterThan(3)
			expect(overview.successRate).toBeGreaterThan(0)
		})

		it('should handle active operations tracking', () => {
			// Start some long-running operations
			const op1 = performanceService.startOperation('long-running-1', { priority: 'high' })
			const op2 = performanceService.startOperation('long-running-2', { priority: 'low' })

			// Check active operations
			const activeOps = performanceService.getActiveOperations()
			expect(activeOps).toHaveLength(2)

			const op1Data = activeOps.find(op => op.operationId === op1)
			expect(op1Data).toBeDefined()
			expect(op1Data!.operationName).toBe('long-running-1')
			expect(op1Data!.metadata).toEqual({ priority: 'high' })

			// End one operation
			performanceService.endOperation(op1, true)

			// Verify only one active operation remains
			const remainingOps = performanceService.getActiveOperations()
			expect(remainingOps).toHaveLength(1)
			expect(remainingOps[0].operationId).toBe(op2)

			// Clean up
			performanceService.endOperation(op2, true)
		})
	})

	describe('alert System Integration', () => {
		it('should handle alert lifecycle', async () => {
			// 1. Create alert rule
			alertService.addAlertRule({
				id: 'lifecycle-test',
				name: 'Lifecycle Test Rule',
				description: 'Test alert lifecycle',
				metric: 'lifecycle.test.metric',
				condition: AlertCondition.GREATER_THAN,
				threshold: 50,
				severity: AlertSeverity.MEDIUM,
				enabled: true,
				cooldownMs: 1000,
			})

			// 2. Record metric that should trigger alert
			monitoringService.recordGauge('lifecycle.test.metric', 75)

			// 3. Manually trigger alert evaluation
			alertService.evaluateAlertsNow()

			// 4. Verify alert was triggered
			let activeAlerts = alertService.getActiveAlerts()
			const triggeredAlert = activeAlerts.find(a => a.ruleId === 'lifecycle-test')
			expect(triggeredAlert).toBeDefined()

			// 5. Resolve alert
			const resolved = alertService.resolveAlert(triggeredAlert!.id)
			expect(resolved).toBe(true)

			// 6. Verify alert is no longer active
			activeAlerts = alertService.getActiveAlerts()
			const stillActive = activeAlerts.find(a => a.id === triggeredAlert!.id)
			expect(stillActive).toBeUndefined()

			// 7. Verify alert is in history
			const history = alertService.getAlertHistory()
			const historicalAlert = history.find(a => a.id === triggeredAlert!.id)
			expect(historicalAlert).toBeDefined()
			expect(historicalAlert!.resolved).toBe(true)
			expect(historicalAlert!.resolvedAt).toBeDefined()
		})

		it('should respect alert cooldown periods', async () => {
			// 1. Create rule with short cooldown
			alertService.addAlertRule({
				id: 'cooldown-test',
				name: 'Cooldown Test Rule',
				description: 'Test alert cooldown',
				metric: 'cooldown.test.metric',
				condition: AlertCondition.GREATER_THAN,
				threshold: 30,
				severity: AlertSeverity.LOW,
				enabled: true,
				cooldownMs: 3000, // 3 seconds
			})

			// 2. Trigger first alert
			monitoringService.recordGauge('cooldown.test.metric', 50)
			alertService.evaluateAlertsNow()

			const firstAlerts = alertService.getActiveAlerts()
			const firstAlert = firstAlerts.find(a => a.ruleId === 'cooldown-test')
			expect(firstAlert).toBeDefined()

			// 3. Try to trigger another alert immediately (should be blocked by cooldown)
			monitoringService.recordGauge('cooldown.test.metric', 60)
			alertService.evaluateAlertsNow()

			const secondAlerts = alertService.getActiveAlerts()
			const duplicateAlerts = secondAlerts.filter(a => a.ruleId === 'cooldown-test')
			expect(duplicateAlerts).toHaveLength(1) // Should still be just one alert

			// 4. Wait for cooldown to expire and trigger again
			await new Promise(resolve => setTimeout(resolve, 3500)) // Wait for 3.5 seconds (cooldown is 3 seconds)
			monitoringService.recordGauge('cooldown.test.metric', 70)
			alertService.evaluateAlertsNow()

			const thirdAlerts = alertService.getActiveAlerts()
			const newAlerts = thirdAlerts.filter(a => a.ruleId === 'cooldown-test')
			expect(newAlerts.length).toBeGreaterThan(1) // Should have new alert after cooldown
		})
	})

	describe('monitoring Statistics', () => {
		it('should provide comprehensive monitoring statistics', () => {
			// Generate diverse metrics
			monitoringService.incrementCounter('stats.test.counter', 10)
			monitoringService.recordGauge('stats.test.gauge', 85.5)
			monitoringService.recordTimer('stats.test.timer', 150)
			monitoringService.recordHistogram('stats.test.histogram', 1024)

			const stats = monitoringService.getStats()

			expect(stats.totalMetrics).toBeGreaterThan(0)
			expect(stats.metricTypes).toHaveProperty('counter')
			expect(stats.metricTypes).toHaveProperty('gauge')
			expect(stats.metricTypes).toHaveProperty('timer')
			expect(stats.metricTypes).toHaveProperty('histogram')
			expect(stats.memoryUsage).toBeGreaterThan(0)
			expect(stats.oldestMetric).toBeLessThanOrEqual(stats.newestMetric)
		})

		it('should provide alert statistics', () => {
			// Trigger some test alerts
			alertService.triggerAlert('Stats Test 1', 'Test message 1', AlertSeverity.LOW)
			alertService.triggerAlert('Stats Test 2', 'Test message 2', AlertSeverity.HIGH)

			const stats = alertService.getAlertStats()

			expect(stats.totalRules).toBeGreaterThan(0)
			expect(stats.activeAlerts).toBeGreaterThan(0)
			expect(stats.alertsBySeverity).toHaveProperty(AlertSeverity.LOW)
			expect(stats.alertsBySeverity).toHaveProperty(AlertSeverity.HIGH)
			expect(stats.alertsLast24h).toBeGreaterThan(0)
		})
	})
})
