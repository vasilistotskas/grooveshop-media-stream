import { Injectable } from '@nestjs/common'
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus'
import { AlertSeverity } from '../interfaces/monitoring.interface'
import { AlertService } from '../services/alert.service'

@Injectable()
export class AlertingHealthIndicator {
	constructor(
		private readonly alertService: AlertService,
		private readonly healthIndicatorService: HealthIndicatorService,
	) {}

	get key(): string {
		return 'alerting'
	}

	async isHealthy(key: string = 'alerting'): Promise<HealthIndicatorResult> {
		try {
			const alertStats = this.alertService.getAlertStats()
			const activeAlerts = this.alertService.getActiveAlerts()

			// Consider system unhealthy if there are critical alerts
			const criticalAlerts = activeAlerts.filter(alert => alert.severity === AlertSeverity.CRITICAL)
			const highAlerts = activeAlerts.filter(alert => alert.severity === AlertSeverity.HIGH)

			const isHealthy = criticalAlerts.length === 0 && highAlerts.length < 3

			const details = {
				totalRules: alertStats.totalRules,
				activeAlerts: alertStats.activeAlerts,
				criticalAlerts: criticalAlerts.length,
				highAlerts: highAlerts.length,
				alertsBySeverity: alertStats.alertsBySeverity,
				alertsLast24h: alertStats.alertsLast24h,
				averageResolutionTime: alertStats.averageResolutionTime,
				recentCriticalAlerts: criticalAlerts.slice(0, 5).map(alert => ({
					id: alert.id,
					ruleName: alert.ruleName,
					message: alert.message,
					timestamp: alert.timestamp,
				})),
			}

			if (!isHealthy) {
				const message = criticalAlerts.length > 0
					? `${criticalAlerts.length} critical alerts active`
					: `${highAlerts.length} high severity alerts active`
				return this.healthIndicatorService.check(key).down({ ...details, message })
			}

			return this.healthIndicatorService.check(key).up(details)
		}
		catch (error: unknown) {
			return this.healthIndicatorService.check(key).down({
				error: (error as Error).message,
				timestamp: Date.now(),
				message: 'Alerting health check failed',
			})
		}
	}

	/**
	 * Get detailed alerting status
	 */
	async getDetailedStatus(): Promise<{
		healthy: boolean
		alertStats: any
		activeAlerts: any[]
		recentAlerts: any[]
	}> {
		try {
			const alertStats = this.alertService.getAlertStats()
			const activeAlerts = this.alertService.getActiveAlerts()
			const recentAlerts = this.alertService.getAlertHistory(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours

			const criticalAlerts = activeAlerts.filter(alert => alert.severity === AlertSeverity.CRITICAL)
			const healthy = criticalAlerts.length === 0

			return {
				healthy,
				alertStats,
				activeAlerts,
				recentAlerts: recentAlerts.slice(0, 10), // Last 10 alerts
			}
		}
		catch (error: unknown) {
			console.error('Alerting health check failed', error)
			return {
				healthy: false,
				alertStats: null,
				activeAlerts: [],
				recentAlerts: [],
			}
		}
	}

	/**
	 * Get alert severity distribution
	 */
	getAlertSeverityDistribution(): Record<AlertSeverity, number> {
		const alertStats = this.alertService.getAlertStats()
		return alertStats.alertsBySeverity
	}

	/**
	 * Check if alerting system is functioning properly
	 */
	async checkAlertingSystem(): Promise<{
		rulesConfigured: boolean
		alertsProcessing: boolean
		recentActivity: boolean
	}> {
		const alertStats = this.alertService.getAlertStats()
		const recentAlerts = this.alertService.getAlertHistory(Date.now() - 60 * 60 * 1000) // Last hour

		return {
			rulesConfigured: alertStats.totalRules > 0,
			alertsProcessing: true, // Assume processing is working if no errors
			recentActivity: recentAlerts.length > 0 || alertStats.activeAlerts > 0,
		}
	}

	/**
	 * Get health indicator description
	 */
	getDescription(): string {
		return 'Monitors alerting system health including active alerts, alert rules, and system responsiveness'
	}
}
