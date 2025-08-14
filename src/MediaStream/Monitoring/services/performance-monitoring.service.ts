import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MonitoringConfig, PerformanceMetrics } from '../interfaces/monitoring.interface'
import { MonitoringService } from './monitoring.service'

@Injectable()
export class PerformanceMonitoringService {
	private readonly _logger = new Logger(PerformanceMonitoringService.name)
	private readonly performanceData = new Map<string, PerformanceMetrics[]>()
	private readonly config: MonitoringConfig
	private readonly activeOperations = new Map<string, { startTime: number, metadata?: any }>()

	constructor(
		private readonly _configService: ConfigService,
		private readonly _correlationService: CorrelationService,
		private readonly monitoringService: MonitoringService,
	) {
		this.config = this._configService.get<MonitoringConfig>('monitoring', {
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
		})

		if (this.config.enabled) {
			this.startPerformanceCleanup()
			this._logger.log('Performance monitoring service initialized')
		}
	}

	/**
	 * Start tracking a performance operation
	 */
	startOperation(operationName: string, metadata?: any): string {
		if (!this.config.enabled)
			return ''

		const operationId = `${operationName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
		this.activeOperations.set(operationId, {
			startTime: Date.now(),
			metadata,
		})

		this._logger.debug(`Started tracking operation: ${operationName}`, {
			correlationId: this._correlationService.getCorrelationId(),
			operationId,
			operationName,
		})

		return operationId
	}

	/**
	 * End tracking a performance operation
	 */
	endOperation(operationId: string, success: boolean = true, errorMessage?: string): void {
		if (!this.config.enabled || !operationId)
			return

		const operation = this.activeOperations.get(operationId)
		if (!operation) {
			this._logger.warn(`Operation not found: ${operationId}`)
			return
		}

		const duration = Date.now() - operation.startTime
		const operationName = operationId.replace(/-\d+-[a-z0-9]+$/, '')

		const performanceMetric: PerformanceMetrics = {
			operationName,
			duration,
			timestamp: Date.now(),
			success,
			errorMessage,
			metadata: operation.metadata,
		}

		this.recordPerformanceMetric(performanceMetric)
		this.activeOperations.delete(operationId)

		this.monitoringService.recordTimer(`performance.${operationName}.duration`, duration)
		this.monitoringService.incrementCounter(`performance.${operationName}.total`)
		if (success) {
			this.monitoringService.incrementCounter(`performance.${operationName}.success`)
		}
		else {
			this.monitoringService.incrementCounter(`performance.${operationName}.error`)
		}

		this._logger.debug(`Completed operation: ${operationName}`, {
			correlationId: this._correlationService.getCorrelationId(),
			operationId,
			duration,
			success,
		})
	}

	/**
	 * Track a synchronous operation
	 */
	trackOperation<T>(operationName: string, operation: () => T, metadata?: any): T {
		const operationId = this.startOperation(operationName, metadata)
		try {
			const result = operation()
			this.endOperation(operationId, true)
			return result
		}
		catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			this.endOperation(operationId, false, errorMessage)
			throw error
		}
	}

	/**
	 * Track an asynchronous operation
	 */
	async trackAsyncOperation<T>(
		operationName: string,
		operation: () => Promise<T>,
		metadata?: any,
	): Promise<T> {
		const operationId = this.startOperation(operationName, metadata)
		try {
			const result = await operation()
			this.endOperation(operationId, true)
			return result
		}
		catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			this.endOperation(operationId, false, errorMessage)
			throw error
		}
	}

	/**
	 * Get performance metrics for an operation
	 */
	getPerformanceMetrics(operationName: string, since?: number): PerformanceMetrics[] {
		const metrics = this.performanceData.get(operationName) || []
		if (since) {
			return metrics.filter(m => m.timestamp >= since)
		}
		return [...metrics]
	}

	/**
	 * Get performance statistics for an operation
	 */
	getPerformanceStats(operationName: string, since?: number): {
		totalOperations: number
		successfulOperations: number
		failedOperations: number
		successRate: number
		averageDuration: number
		minDuration: number
		maxDuration: number
		p50Duration: number
		p95Duration: number
		p99Duration: number
	} {
		const metrics = this.getPerformanceMetrics(operationName, since)
		if (metrics.length === 0) {
			return {
				totalOperations: 0,
				successfulOperations: 0,
				failedOperations: 0,
				successRate: 0,
				averageDuration: 0,
				minDuration: 0,
				maxDuration: 0,
				p50Duration: 0,
				p95Duration: 0,
				p99Duration: 0,
			}
		}

		const successful = metrics.filter(m => m.success)
		const failed = metrics.filter(m => !m.success)
		const durations = metrics.map(m => m.duration).sort((a: any, b: any) => a - b)
		const totalDuration = durations.reduce((sum: any, d: any) => sum + d, 0)

		return {
			totalOperations: metrics.length,
			successfulOperations: successful.length,
			failedOperations: failed.length,
			successRate: (successful.length / metrics.length) * 100,
			averageDuration: totalDuration / metrics.length,
			minDuration: durations[0] || 0,
			maxDuration: durations[durations.length - 1] || 0,
			p50Duration: this.getPercentile(durations, 50),
			p95Duration: this.getPercentile(durations, 95),
			p99Duration: this.getPercentile(durations, 99),
		}
	}

	/**
	 * Get all tracked operation names
	 */
	getTrackedOperations(): string[] {
		return Array.from(this.performanceData.keys())
	}

	/**
	 * Get currently active operations
	 */
	getActiveOperations(): Array<{
		operationId: string
		operationName: string
		startTime: number
		duration: number
		metadata?: any
	}> {
		const now = Date.now()
		const activeOps: Array<{
			operationId: string
			operationName: string
			startTime: number
			duration: number
			metadata?: any
		}> = []

		for (const [operationId, operation] of this.activeOperations.entries()) {
			const operationName = operationId.replace(/-\d+-[a-z0-9]+$/, '')
			activeOps.push({
				operationId,
				operationName,
				startTime: operation.startTime,
				duration: now - operation.startTime,
				metadata: operation.metadata,
			})
		}

		return activeOps
	}

	/**
	 * Get performance overview
	 */
	getPerformanceOverview(since?: number): {
		totalOperations: number
		averageResponseTime: number
		successRate: number
		slowestOperations: Array<{ name: string, avgDuration: number }>
		mostFrequentOperations: Array<{ name: string, count: number }>
		errorRates: Array<{ name: string, errorRate: number }>
	} {
		const operations = this.getTrackedOperations()
		let totalOps = 0
		let totalDuration = 0
		let totalSuccessful = 0

		const operationStats: Array<{
			name: string
			count: number
			avgDuration: number
			errorRate: number
		}> = []

		for (const operationName of operations) {
			const stats = this.getPerformanceStats(operationName, since)
			totalOps += stats.totalOperations
			totalDuration += stats.averageDuration * stats.totalOperations
			totalSuccessful += stats.successfulOperations

			operationStats.push({
				name: operationName,
				count: stats.totalOperations,
				avgDuration: stats.averageDuration,
				errorRate: 100 - stats.successRate,
			})
		}

		const slowestOperations = [...operationStats]
			.sort((a: any, b: any) => b.avgDuration - a.avgDuration)
			.slice(0, 5)
			.map(op => ({ name: op.name, avgDuration: op.avgDuration }))

		const mostFrequentOperations = [...operationStats]
			.sort((a: any, b: any) => b.count - a.count)
			.slice(0, 5)
			.map(op => ({ name: op.name, count: op.count }))

		const errorRates = [...operationStats]
			.filter(op => op.errorRate > 0)
			.sort((a: any, b: any) => b.errorRate - a.errorRate)
			.slice(0, 5)
			.map(op => ({ name: op.name, errorRate: op.errorRate }))

		return {
			totalOperations: totalOps,
			averageResponseTime: totalOps > 0 ? totalDuration / totalOps : 0,
			successRate: totalOps > 0 ? (totalSuccessful / totalOps) * 100 : 0,
			slowestOperations,
			mostFrequentOperations,
			errorRates,
		}
	}

	/**
	 * Record a performance metric
	 */
	private recordPerformanceMetric(metric: PerformanceMetrics): void {
		if (!this.performanceData.has(metric.operationName)) {
			this.performanceData.set(metric.operationName, [])
		}

		const metrics = this.performanceData.get(metric.operationName)!
		metrics.push(metric)

		const maxMetricsPerOperation = 10000
		if (metrics.length > maxMetricsPerOperation) {
			metrics.splice(0, metrics.length - maxMetricsPerOperation)
		}
	}

	/**
	 * Calculate percentile from sorted array
	 */
	private getPercentile(sortedArray: number[], percentile: number): number {
		if (sortedArray.length === 0)
			return 0
		const index = Math.ceil((percentile / 100) * sortedArray.length) - 1
		return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))]
	}

	/**
	 * Start performance data cleanup
	 */
	private startPerformanceCleanup(): void {
		const cleanupInterval = Math.min(this.config.performanceRetentionMs / 10, 60 * 60 * 1000)
		setInterval(() => {
			this.cleanupOldPerformanceData()
		}, cleanupInterval)
	}

	/**
	 * Clean up old performance data
	 */
	private cleanupOldPerformanceData(): void {
		const cutoffTime = Date.now() - this.config.performanceRetentionMs
		let removedCount = 0

		for (const [operationName, metrics] of this.performanceData.entries()) {
			const originalLength = metrics.length
			const filteredMetrics = metrics.filter(m => m.timestamp >= cutoffTime)
			if (filteredMetrics.length !== originalLength) {
				this.performanceData.set(operationName, filteredMetrics)
				removedCount += originalLength - filteredMetrics.length
			}
		}

		if (removedCount > 0) {
			this._logger.debug(`Cleaned up ${removedCount} old performance metrics`)
		}
	}
}
