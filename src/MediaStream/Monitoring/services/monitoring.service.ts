import * as process from 'node:process'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CorrelationService } from '../../Correlation/services/correlation.service'
import {
	ComponentHealth,
	CustomMetric,
	MetricType,
	MonitoringConfig,
	SystemHealth,
} from '../interfaces/monitoring.interface'

@Injectable()
export class MonitoringService {
	private readonly _logger = new Logger(MonitoringService.name)
	private readonly metrics = new Map<string, CustomMetric[]>()
	private readonly config: MonitoringConfig
	private readonly maxMetricsPerType = 10000

	constructor(
		private readonly _configService: ConfigService,
		private readonly _correlationService: CorrelationService,
	) {
		this.config = this._configService.get<MonitoringConfig>('monitoring', {
			enabled: true,
			metricsRetentionMs: 24 * 60 * 60 * 1000, // 24 hours
			alertsRetentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
			performanceRetentionMs: 24 * 60 * 60 * 1000, // 24 hours
			healthCheckIntervalMs: 30 * 1000, // 30 seconds
			alertCooldownMs: 5 * 60 * 1000, // 5 minutes
			externalIntegrations: {
				enabled: false,
				endpoints: [],
			},
		})

		if (this.config.enabled) {
			this.startMetricsCleanup()
			this._logger.log('Monitoring service initialized')
		}
	}

	/**
	 * Record a custom metric
	 */
	recordMetric(name: string, value: number, type: MetricType, tags?: Record<string, string>): void {
		if (!this.config.enabled)
			return

		const metric: CustomMetric = {
			name,
			value,
			timestamp: Date.now(),
			tags,
			type,
		}

		if (!this.metrics.has(name)) {
			this.metrics.set(name, [])
		}

		const metricsList = this.metrics.get(name)!
		metricsList.push(metric)

		// Keep only the most recent metrics to prevent memory issues
		if (metricsList.length > this.maxMetricsPerType) {
			metricsList.splice(0, metricsList.length - this.maxMetricsPerType)
		}

		this._logger.debug(`Recorded metric: ${name} = ${value}`, {
			correlationId: this._correlationService.getCorrelationId(),
			metric,
		})
	}

	/**
	 * Record a counter metric (incremental value)
	 */
	incrementCounter(name: string, value: number = 1, tags?: Record<string, string>): void {
		this.recordMetric(name, value, MetricType.COUNTER, tags)
	}

	/**
	 * Record a gauge metric (current value)
	 */
	recordGauge(name: string, value: number, tags?: Record<string, string>): void {
		this.recordMetric(name, value, MetricType.GAUGE, tags)
	}

	/**
	 * Record a histogram metric (distribution of values)
	 */
	recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
		this.recordMetric(name, value, MetricType.HISTOGRAM, tags)
	}

	/**
	 * Record a timer metric (duration)
	 */
	recordTimer(name: string, durationMs: number, tags?: Record<string, string>): void {
		this.recordMetric(name, durationMs, MetricType.TIMER, tags)
	}

	/**
	 * Get metrics by name
	 */
	getMetrics(name: string, since?: number): CustomMetric[] {
		const metrics = this.metrics.get(name) || []
		if (since) {
			return metrics.filter(m => m.timestamp >= since)
		}
		return [...metrics]
	}

	/**
	 * Get all metric names
	 */
	getMetricNames(): string[] {
		return Array.from(this.metrics.keys())
	}

	/**
	 * Get aggregated metrics for a time period
	 */
	getAggregatedMetrics(name: string, since: number): {
		count: number
		sum: number
		avg: number
		min: number
		max: number
		latest: number
	} {
		const metrics = this.getMetrics(name, since)
		if (metrics.length === 0) {
			return {
				count: 0,
				sum: 0,
				avg: 0,
				min: 0,
				max: 0,
				latest: 0,
			}
		}

		const values = metrics.map(m => m.value)
		const sum = values.reduce((a: any, b: any) => a + b, 0)

		return {
			count: metrics.length,
			sum,
			avg: sum / metrics.length,
			min: Math.min(...values),
			max: Math.max(...values),
			latest: metrics[metrics.length - 1].value,
		}
	}

	/**
	 * Get system health overview
	 */
	async getSystemHealth(): Promise<SystemHealth> {
		const components: ComponentHealth[] = []
		let totalScore = 0

		// Check various system components
		const memoryHealth = await this.checkMemoryHealth()
		const diskHealth = await this.checkDiskHealth()
		const networkHealth = await this.checkNetworkHealth()
		const cacheHealth = await this.checkCacheHealth()

		components.push(memoryHealth, diskHealth, networkHealth, cacheHealth)

		// Calculate overall score
		totalScore = components.reduce((sum: any, comp: any) => sum + comp.score, 0) / components.length

		// More lenient overall health scoring
		let status: 'healthy' | 'degraded' | 'unhealthy'
		if (totalScore >= 70) {
			status = 'healthy'
		}
		else if (totalScore >= 50) {
			status = 'degraded'
		}
		else {
			status = 'unhealthy'
		}

		return {
			status,
			timestamp: Date.now(),
			components,
			overallScore: totalScore,
		}
	}

	/**
	 * Get monitoring statistics
	 */
	getStats(): {
		totalMetrics: number
		metricTypes: Record<string, number>
		oldestMetric: number
		newestMetric: number
		memoryUsage: number
	} {
		let totalMetrics = 0
		let oldestTimestamp = Date.now()
		let newestTimestamp = 0
		const metricTypes: Record<string, number> = {}

		for (const [_name, metrics] of this.metrics.entries()) {
			totalMetrics += metrics.length
			for (const metric of metrics) {
				metricTypes[metric.type] = (metricTypes[metric.type] || 0) + 1
				oldestTimestamp = Math.min(oldestTimestamp, metric.timestamp)
				newestTimestamp = Math.max(newestTimestamp, metric.timestamp)
			}
		}

		// Estimate memory usage (rough calculation)
		const avgMetricSize = 200 // bytes per metric (rough estimate)
		const memoryUsage = totalMetrics * avgMetricSize

		return {
			totalMetrics,
			metricTypes,
			oldestMetric: oldestTimestamp,
			newestMetric: newestTimestamp,
			memoryUsage,
		}
	}

	/**
	 * Clear old metrics based on retention policy
	 */
	private startMetricsCleanup(): void {
		const cleanupInterval = Math.min(this.config.metricsRetentionMs / 10, 60 * 60 * 1000) // Max 1 hour
		setInterval(() => {
			this.cleanupOldMetrics()
		}, cleanupInterval)
	}

	private cleanupOldMetrics(): void {
		const cutoffTime = Date.now() - this.config.metricsRetentionMs
		let removedCount = 0

		for (const [name, metrics] of this.metrics.entries()) {
			const originalLength = metrics.length
			const filteredMetrics = metrics.filter(m => m.timestamp >= cutoffTime)
			if (filteredMetrics.length !== originalLength) {
				this.metrics.set(name, filteredMetrics)
				removedCount += originalLength - filteredMetrics.length
			}
		}

		if (removedCount > 0) {
			this._logger.debug(`Cleaned up ${removedCount} old metrics`)
		}
	}

	private async checkMemoryHealth(): Promise<ComponentHealth> {
		const memUsage = process.memoryUsage()
		const totalMB = memUsage.heapTotal / 1024 / 1024
		const usedMB = memUsage.heapUsed / 1024 / 1024
		const usagePercent = (usedMB / totalMB) * 100

		// More lenient scoring for Node.js applications
		let score = 100
		if (usagePercent > 98)
			score = 20
		else if (usagePercent > 95)
			score = 50
		else if (usagePercent > 90)
			score = 70
		else if (usagePercent > 85)
			score = 85

		return {
			name: 'memory',
			status: score >= 60 ? 'healthy' : score >= 40 ? 'degraded' : 'unhealthy',
			score,
			metrics: {
				totalMB,
				usedMB,
				usagePercent,
			},
			lastCheck: Date.now(),
		}
	}

	private async checkDiskHealth(): Promise<ComponentHealth> {
		// Simplified disk health check
		// In a real implementation, you'd check actual disk usage
		return {
			name: 'disk',
			status: 'healthy',
			score: 90,
			metrics: {
				usagePercent: 45,
				availableGB: 100,
			},
			lastCheck: Date.now(),
		}
	}

	private async checkNetworkHealth(): Promise<ComponentHealth> {
		// Simplified network health check
		// In a real implementation, you'd check network connectivity
		return {
			name: 'network',
			status: 'healthy',
			score: 95,
			metrics: {
				latencyMs: 10,
				packetsLost: 0,
			},
			lastCheck: Date.now(),
		}
	}

	private async checkCacheHealth(): Promise<ComponentHealth> {
		// Check cache performance metrics
		const cacheHits = this.getAggregatedMetrics('cache.hits', Date.now() - 60000) // Last minute
		const cacheMisses = this.getAggregatedMetrics('cache.misses', Date.now() - 60000)
		const totalRequests = cacheHits.sum + cacheMisses.sum
		const hitRate = totalRequests > 0 ? (cacheHits.sum / totalRequests) * 100 : 85 // Default to good score if no data

		// More lenient cache scoring - low hit rates are normal for new applications
		let score = 100
		if (hitRate < 20)
			score = 60
		else if (hitRate < 40)
			score = 70
		else if (hitRate < 60)
			score = 80
		else if (hitRate < 80)
			score = 90

		return {
			name: 'cache',
			status: score >= 60 ? 'healthy' : score >= 40 ? 'degraded' : 'unhealthy',
			score,
			metrics: {
				hitRate,
				hits: cacheHits.sum,
				misses: cacheMisses.sum,
			},
			lastCheck: Date.now(),
		}
	}
}
