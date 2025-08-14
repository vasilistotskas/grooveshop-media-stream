import { ConfigService } from '@microservice/Config/config.service'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as promClient from 'prom-client'

@Injectable()
export class RateLimitMetricsService implements OnModuleInit {
	private readonly _logger = new Logger(RateLimitMetricsService.name)
	private readonly register: promClient.Registry

	private readonly rateLimitAttemptsTotal: promClient.Counter
	private readonly rateLimitBlockedTotal: promClient.Counter
	private readonly rateLimitCurrentRequests: promClient.Gauge
	private readonly rateLimitAdaptiveAdjustments: promClient.Counter
	private readonly rateLimitSystemLoad: promClient.Gauge

	constructor(
		private readonly _configService: ConfigService,
	) {
		this.register = new promClient.Registry()

		this.rateLimitAttemptsTotal = new promClient.Counter({
			name: 'mediastream_rate_limit_attempts_total',
			help: 'Total number of rate limit attempts',
			labelNames: ['request_type', 'client_ip', 'status'],
			registers: [this.register],
		})

		this.rateLimitBlockedTotal = new promClient.Counter({
			name: 'mediastream_rate_limit_blocked_total',
			help: 'Total number of blocked requests due to rate limiting',
			labelNames: ['request_type', 'client_ip', 'reason'],
			registers: [this.register],
		})

		this.rateLimitCurrentRequests = new promClient.Gauge({
			name: 'mediastream_rate_limit_current_requests',
			help: 'Current number of requests in rate limit window',
			labelNames: ['request_type', 'client_ip'],
			registers: [this.register],
		})

		this.rateLimitAdaptiveAdjustments = new promClient.Counter({
			name: 'mediastream_rate_limit_adaptive_adjustments_total',
			help: 'Total number of adaptive rate limit adjustments',
			labelNames: ['adjustment_type', 'reason'],
			registers: [this.register],
		})

		this.rateLimitSystemLoad = new promClient.Gauge({
			name: 'mediastream_rate_limit_system_load',
			help: 'System load metrics used for adaptive rate limiting',
			labelNames: ['metric_type'],
			registers: [this.register],
		})
	}

	async onModuleInit(): Promise<void> {
		if (this._configService.get('monitoring.enabled')) {
			this._logger.log('Rate limit metrics service initialized')
		}
	}

	/**
	 * Record a rate limit attempt
	 */
	recordRateLimitAttempt(requestType: string, clientIp: string, allowed: boolean): void {
		const status = allowed ? 'allowed' : 'blocked'

		this.rateLimitAttemptsTotal.inc({
			request_type: requestType,
			client_ip: this.hashIp(clientIp),
			status,
		})

		if (!allowed) {
			this.rateLimitBlockedTotal.inc({
				request_type: requestType,
				client_ip: this.hashIp(clientIp),
				reason: 'rate_limit_exceeded',
			})
		}
	}

	/**
	 * Update current request count for a client
	 */
	updateCurrentRequests(requestType: string, clientIp: string, count: number): void {
		this.rateLimitCurrentRequests.set({
			request_type: requestType,
			client_ip: this.hashIp(clientIp),
		}, count)
	}

	/**
	 * Record adaptive rate limit adjustment
	 */
	recordAdaptiveAdjustment(adjustmentType: 'increase' | 'decrease', reason: string): void {
		this.rateLimitAdaptiveAdjustments.inc({
			adjustment_type: adjustmentType,
			reason,
		})
	}

	/**
	 * Update system load metrics
	 */
	updateSystemLoadMetrics(cpuUsage: number, memoryUsage: number, activeConnections: number): void {
		this.rateLimitSystemLoad.set({ metric_type: 'cpu_usage' }, cpuUsage)
		this.rateLimitSystemLoad.set({ metric_type: 'memory_usage' }, memoryUsage)
		this.rateLimitSystemLoad.set({ metric_type: 'active_connections' }, activeConnections)
	}

	/**
	 * Get rate limiting statistics
	 */
	async getRateLimitStats(): Promise<{
		totalAttempts: number
		totalBlocked: number
		blockRate: number
		topBlockedIps: Array<{ ip: string, count: number }>
		topRequestTypes: Array<{ type: string, count: number }>
	}> {
		try {
			// In a real implementation, this would query the metrics registry
			// For now, we'll return placeholder data
			return {
				totalAttempts: 0,
				totalBlocked: 0,
				blockRate: 0,
				topBlockedIps: [],
				topRequestTypes: [],
			}
		}
		catch (error: unknown) {
			this._logger.error('Failed to get rate limit stats:', error)
			throw error
		}
	}

	/**
	 * Get current rate limit configuration
	 */
	getCurrentRateLimitConfig(): {
		defaultLimit: number
		imageProcessingLimit: number
		healthCheckLimit: number
		windowMs: number
	} {
		return {
			defaultLimit: this._configService.getOptional('rateLimit.default.max', 100),
			imageProcessingLimit: this._configService.getOptional('rateLimit.imageProcessing.max', 50),
			healthCheckLimit: this._configService.getOptional('rateLimit.healthCheck.max', 1000),
			windowMs: this._configService.getOptional('rateLimit.default.windowMs', 60000),
		}
	}

	/**
	 * Hash IP address for privacy in metrics
	 */
	private hashIp(ip: string): string {
		let hash = 0
		for (let i = 0; i < ip.length; i++) {
			const char = ip.charCodeAt(i)
			hash = ((hash << 5) - hash) + char
			hash = hash & hash
		}
		return `ip_${Math.abs(hash).toString(36)}`
	}

	/**
	 * Reset metrics (useful for testing)
	 */
	resetMetrics(): void {
		this.rateLimitAttemptsTotal.reset()
		this.rateLimitBlockedTotal.reset()
		this.rateLimitCurrentRequests.reset()
		this.rateLimitAdaptiveAdjustments.reset()
		this.rateLimitSystemLoad.reset()
	}
}
