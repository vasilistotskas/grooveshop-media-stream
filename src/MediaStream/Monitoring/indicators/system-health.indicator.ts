import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator'
import { Injectable } from '@nestjs/common'
import { HealthIndicatorResult } from '@nestjs/terminus'
import { MonitoringService } from '../services/monitoring.service'

@Injectable()
export class SystemHealthIndicator extends BaseHealthIndicator {
	constructor(private readonly monitoringService: MonitoringService) {
		super('system')
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		try {
			const systemHealth = await this.monitoringService.getSystemHealth()
			const isHealthy = systemHealth.status === 'healthy'

			const details = {
				status: systemHealth.status,
				overallScore: systemHealth.overallScore,
				components: systemHealth.components.map(comp => ({
					name: comp.name,
					status: comp.status,
					score: comp.score,
					lastCheck: comp.lastCheck,
				})),
				timestamp: systemHealth.timestamp,
			}

			if (!isHealthy) {
				return this.createUnhealthyResult('System is not healthy', details)
			}

			return this.createHealthyResult(details)
		}
		catch (error: unknown) {
			return this.createUnhealthyResult('System health check failed', {
				error: (error as Error).message,
				timestamp: Date.now(),
			})
		}
	}

	/**
	 * Get detailed system status
	 */
	async getDetailedStatus(): Promise<{
		healthy: boolean
		systemHealth: any
		monitoringStats: any
	}> {
		try {
			const [systemHealth, monitoringStats] = await Promise.all([
				this.monitoringService.getSystemHealth(),
				this.monitoringService.getStats(),
			])

			return {
				healthy: systemHealth.status === 'healthy',
				systemHealth,
				monitoringStats,
			}
		}
		catch (error: unknown) {
			this.logger.error(`Failed to get system status: ${(error as Error).message}`, error)
			return {
				healthy: false,
				systemHealth: null,
				monitoringStats: null,
			}
		}
	}

	/**
	 * Get component health details
	 */
	async getComponentHealth(componentName: string): Promise<any> {
		const systemHealth = await this.monitoringService.getSystemHealth()
		return systemHealth.components.find(comp => comp.name === componentName)
	}

	/**
	 * Get health indicator description
	 */
	protected getDescription(): string {
		return 'Monitors overall system health including memory, disk, network, and cache components'
	}
}
