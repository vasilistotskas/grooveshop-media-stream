import * as process from 'node:process'
import { ConfigService } from '@microservice/Config/config.service'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { Injectable, Logger } from '@nestjs/common'

export interface RateLimitConfig {
	windowMs: number
	max: number
	skipSuccessfulRequests: boolean
	skipFailedRequests: boolean
	keyGenerator?: (req: any) => string
}

export interface RateLimitInfo {
	limit: number
	current: number
	remaining: number
	resetTime: Date
}

export interface SystemLoadInfo {
	cpuUsage: number
	memoryUsage: number
	activeConnections: number
}

@Injectable()
export class RateLimitService {
	private readonly _logger = new Logger(RateLimitService.name)
	private readonly requestCounts = new Map<string, { count: number, resetTime: number }>()
	private readonly systemLoadThresholds = {
		cpu: 80, // 80% CPU usage
		memory: 85, // 85% memory usage
		connections: 1000, // 1000 active connections
	}

	constructor(
		private readonly _configService: ConfigService,
		private readonly metricsService: MetricsService,
	) {}

	/**
	 * Generate rate limit key based on IP and request type
	 */
	generateKey(ip: string, requestType: string): string {
		return `${ip}:${requestType}`
	}

	/**
	 * Generate key based on IP and user agent for more granular control
	 */
	generateAdvancedKey(ip: string, userAgent: string, requestType: string): string {
		// Create a simple hash of user agent to avoid storing full strings
		const userAgentHash = this.simpleHash(userAgent || 'unknown')
		return `${ip}:${userAgentHash}:${requestType}`
	}

	/**
	 * Get rate limit configuration for specific request type
	 */
	getRateLimitConfig(requestType: string): RateLimitConfig {
		const baseConfig = {
			windowMs: this._configService.getOptional('rateLimit.default.windowMs', 60000),
			max: this._configService.getOptional('rateLimit.default.max', 100),
			skipSuccessfulRequests: false,
			skipFailedRequests: false,
		}

		switch (requestType) {
			case 'image-processing':
				return {
					...baseConfig,
					windowMs: this._configService.getOptional('rateLimit.imageProcessing.windowMs', 60000),
					max: this._configService.getOptional('rateLimit.imageProcessing.max', 50),
				}
			case 'health-check':
				return {
					...baseConfig,
					windowMs: this._configService.getOptional('rateLimit.healthCheck.windowMs', 10000),
					max: this._configService.getOptional('rateLimit.healthCheck.max', 1000),
				}
			default:
				return baseConfig
		}
	}

	/**
	 * Check if request should be rate limited
	 */
	async checkRateLimit(key: string, config: RateLimitConfig): Promise<{ allowed: boolean, info: RateLimitInfo }> {
		const now = Date.now()
		const windowStart = now - config.windowMs

		// Clean up old entries
		this.cleanupOldEntries(windowStart)

		const entry = this.requestCounts.get(key)
		const resetTime = new Date(now + config.windowMs)

		if (!entry || entry.resetTime <= now) {
			// First request in window or window expired
			this.requestCounts.set(key, { count: 1, resetTime: now + config.windowMs })

			return {
				allowed: true,
				info: {
					limit: config.max,
					current: 1,
					remaining: config.max - 1,
					resetTime,
				},
			}
		}

		// Increment counter
		entry.count++
		const allowed = entry.count <= config.max

		return {
			allowed,
			info: {
				limit: config.max,
				current: entry.count,
				remaining: Math.max(0, config.max - entry.count),
				resetTime: new Date(entry.resetTime),
			},
		}
	}

	/**
	 * Get current system load for adaptive rate limiting
	 */
	async getSystemLoad(): Promise<SystemLoadInfo> {
		const memoryUsage = process.memoryUsage()
		const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100

		// Note: CPU usage would require additional monitoring in a real implementation
		// For now, we'll use a placeholder
		const cpuUsage = 0 // This would be implemented with actual CPU monitoring

		return {
			cpuUsage,
			memoryUsage: memoryUsagePercent,
			activeConnections: 0, // This would be tracked by connection monitoring
		}
	}

	/**
	 * Calculate adaptive rate limit based on system load
	 */
	async calculateAdaptiveLimit(baseLimit: number): Promise<number> {
		const systemLoad = await this.getSystemLoad()

		let adaptiveLimit = baseLimit

		// Reduce limit based on memory usage
		if (systemLoad.memoryUsage > this.systemLoadThresholds.memory) {
			const reductionFactor = Math.min(0.5, (systemLoad.memoryUsage - this.systemLoadThresholds.memory) / 20)
			adaptiveLimit = Math.floor(adaptiveLimit * (1 - reductionFactor))
		}

		// Reduce limit based on CPU usage
		if (systemLoad.cpuUsage > this.systemLoadThresholds.cpu) {
			const reductionFactor = Math.min(0.5, (systemLoad.cpuUsage - this.systemLoadThresholds.cpu) / 20)
			adaptiveLimit = Math.floor(adaptiveLimit * (1 - reductionFactor))
		}

		// Ensure minimum limit
		return Math.max(1, adaptiveLimit)
	}

	/**
	 * Record rate limit metrics
	 */
	recordRateLimitMetrics(requestType: string, allowed: boolean, info: RateLimitInfo): void {
		// Record rate limit metrics using error tracking
		if (!allowed) {
			this.metricsService.recordError('rate_limit_exceeded', requestType)
		}

		// Record custom rate limit metrics if available
		try {
			this.metricsService.getRegistry()

			// This would be implemented with custom Prometheus metrics
			this._logger.debug('Rate limit metrics recorded', {
				requestType,
				allowed,
				current: info.current,
				limit: info.limit,
				remaining: info.remaining,
			})
		}
		catch (error: unknown) {
			this._logger.error('Failed to record rate limit metrics:', error)
		}
	}

	/**
	 * Clean up old rate limit entries
	 */
	private cleanupOldEntries(windowStart: number): void {
		for (const [key, entry] of this.requestCounts.entries()) {
			if (entry.resetTime <= windowStart) {
				this.requestCounts.delete(key)
			}
		}
	}

	/**
	 * Simple hash function for user agent
	 */
	private simpleHash(str: string): string {
		let hash = 0
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i)
			hash = ((hash << 5) - hash) + char
			hash = hash & hash // Convert to 32-bit integer
		}
		return Math.abs(hash).toString(36)
	}

	/**
	 * Reset rate limit for a specific key (useful for testing)
	 */
	resetRateLimit(key: string): void {
		this.requestCounts.delete(key)
	}

	/**
	 * Get current rate limit status for a key
	 */
	getRateLimitStatus(key: string): RateLimitInfo | null {
		const entry = this.requestCounts.get(key)
		if (!entry) {
			return null
		}

		return {
			limit: 0, // Would need to be passed or stored
			current: entry.count,
			remaining: 0, // Would need to be calculated
			resetTime: new Date(entry.resetTime),
		}
	}
}
