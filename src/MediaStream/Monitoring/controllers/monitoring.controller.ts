import type { Alert, AlertRule, AlertSeverity, SystemHealth } from '../interfaces/monitoring.interface'
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common'
import { AlertService } from '../services/alert.service'
import { MonitoringService } from '../services/monitoring.service'
import { PerformanceMonitoringService } from '../services/performance-monitoring.service'

@Controller('monitoring')
export class MonitoringController {
	constructor(
		private readonly monitoringService: MonitoringService,
		private readonly alertService: AlertService,
		private readonly performanceService: PerformanceMonitoringService,
	) {}

	/**
	 * Get system health overview
	 */
	@Get('health')
	async getSystemHealth(): Promise<SystemHealth> {
		return await this.monitoringService.getSystemHealth()
	}

	/**
	 * Get monitoring dashboard data
	 */
	@Get('dashboard')
	async getDashboard(@Query('since') since?: string): Promise<any> {
		const sinceTimestamp = since ? Number.parseInt(since) : Date.now() - 24 * 60 * 60 * 1000

		const [systemHealth, alertStats, performanceOverview, monitoringStats] = await Promise.all([
			this.monitoringService.getSystemHealth(),
			this.alertService.getAlertStats(),
			this.performanceService.getPerformanceOverview(sinceTimestamp),
			this.monitoringService.getStats(),
		])

		return {
			timestamp: Date.now(),
			systemHealth,
			alerts: {
				...alertStats,
				activeAlerts: this.alertService.getActiveAlerts(),
			},
			performance: performanceOverview,
			monitoring: monitoringStats,
		}
	}

	/**
	 * Get metrics by name
	 */
	@Get('metrics/:name')
	getMetrics(
		@Param('name') name: string,
		@Query('since') since?: string,
		@Query('aggregated') aggregated?: string,
	): any {
		const sinceTimestamp = since ? Number.parseInt(since) : undefined

		if (aggregated === 'true' && sinceTimestamp !== undefined) {
			return this.monitoringService.getAggregatedMetrics(name, sinceTimestamp)
		}

		return {
			name,
			metrics: this.monitoringService.getMetrics(name, sinceTimestamp),
		}
	}

	/**
	 * Get all metric names
	 */
	@Get('metrics')
	getMetricNames(): { metrics: string[] } {
		return {
			metrics: this.monitoringService.getMetricNames(),
		}
	}

	/**
	 * Get alert rules
	 */
	@Get('alerts/rules')
	getAlertRules(): { rules: AlertRule[] } {
		return {
			rules: this.alertService.getAlertRules(),
		}
	}

	/**
	 * Add or update alert rule
	 */
	@Post('alerts/rules')
	@HttpCode(HttpStatus.CREATED)
	addAlertRule(@Body() rule: AlertRule): { success: boolean, message: string } {
		this.alertService.addAlertRule(rule)
		return { success: true, message: 'Alert rule added successfully' }
	}

	/**
	 * Get active alerts
	 */
	@Get('alerts/active')
	getActiveAlerts(): { alerts: Alert[] } {
		return {
			alerts: this.alertService.getActiveAlerts(),
		}
	}

	/**
	 * Get alert history
	 */
	@Get('alerts/history')
	getAlertHistory(@Query('since') since?: string): { alerts: Alert[] } {
		const sinceTimestamp = since ? Number.parseInt(since) : undefined
		return {
			alerts: this.alertService.getAlertHistory(sinceTimestamp),
		}
	}

	/**
	 * Trigger manual alert
	 */
	@Post('alerts/trigger')
	@HttpCode(HttpStatus.CREATED)
	triggerAlert(@Body() alertData: {
		ruleName: string
		message: string
		severity: AlertSeverity
		metadata?: Record<string, any>
	}): { success: boolean, message: string } {
		this.alertService.triggerAlert(
			alertData.ruleName,
			alertData.message,
			alertData.severity,
			alertData.metadata,
		)
		return { success: true, message: 'Alert triggered successfully' }
	}

	/**
	 * Resolve alert
	 */
	@Post('alerts/:alertId/resolve')
	@HttpCode(HttpStatus.OK)
	resolveAlert(@Param('alertId') alertId: string): { success: boolean, message: string } {
		const resolved = this.alertService.resolveAlert(alertId)
		return {
			success: resolved,
			message: resolved ? 'Alert resolved successfully' : 'Alert not found or already resolved',
		}
	}

	/**
	 * Get performance metrics for an operation
	 */
	@Get('performance/:operationName')
	getPerformanceMetrics(
		@Param('operationName') operationName: string,
		@Query('since') since?: string,
		@Query('stats') stats?: string,
	): any {
		const sinceTimestamp = since ? Number.parseInt(since) : undefined

		if (stats === 'true') {
			return this.performanceService.getPerformanceStats(operationName, sinceTimestamp)
		}

		return {
			operationName,
			metrics: this.performanceService.getPerformanceMetrics(operationName, sinceTimestamp),
		}
	}

	/**
	 * Get all tracked operations
	 */
	@Get('performance')
	getTrackedOperations(): { operations: string[], activeOperations: { operationId: string, operationName: string, startTime: number, duration: number, metadata?: any }[] } {
		return {
			operations: this.performanceService.getTrackedOperations(),
			activeOperations: this.performanceService.getActiveOperations(),
		}
	}

	/**
	 * Get performance overview
	 */
	@Get('performance/overview')
	getPerformanceOverview(@Query('since') since?: string): any {
		const sinceTimestamp = since ? Number.parseInt(since) : undefined
		return this.performanceService.getPerformanceOverview(sinceTimestamp)
	}

	/**
	 * Get monitoring statistics
	 */
	@Get('stats')
	getMonitoringStats(): any {
		return {
			monitoring: this.monitoringService.getStats(),
			alerts: this.alertService.getAlertStats(),
		}
	}
}
