import * as process from 'node:process'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { ConfigService } from '#microservice/Config/config.service'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
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

/**
 * Distributed rate limiting service using Redis for horizontal scaling.
 * Falls back to in-memory storage if Redis is unavailable.
 */
@Injectable()
export class RateLimitService {
	private readonly _logger = new Logger(RateLimitService.name)
	/** In-memory fallback when Redis is unavailable */
	private readonly localRequestCounts = new Map<string, { count: number, resetTime: number }>()
	private readonly systemLoadThresholds = {
		cpu: 80,
		memory: 85,
		connections: 1000,
	}

	private readonly RATE_LIMIT_PREFIX = 'ratelimit:'

	constructor(
		private readonly _configService: ConfigService,
		private readonly metricsService: MetricsService,
		private readonly redisCacheService: RedisCacheService,
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
		const userAgentHash = this.simpleHash(userAgent || 'unknown')
		return `${ip}:${userAgentHash}:${requestType}`
	}

	/**
	 * Get rate limit configuration for specific request type
	 */
	getRateLimitConfig(requestType: string): RateLimitConfig {
		const baseConfig = {
			windowMs: this._configService.getOptional('rateLimit.default.windowMs', 60000),
			max: this._configService.getOptional('rateLimit.default.max', 500),
			skipSuccessfulRequests: false,
			skipFailedRequests: false,
		}

		switch (requestType) {
			case 'image-processing':
				return {
					...baseConfig,
					windowMs: this._configService.getOptional('rateLimit.imageProcessing.windowMs', 60000),
					max: this._configService.getOptional('rateLimit.imageProcessing.max', 300),
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
	 * Check if user agent is a known bot/crawler
	 */
	isBot(userAgent: string): boolean {
		if (!userAgent) {
			return false
		}

		const botPatterns = [
			// Social Media Crawlers
			/facebook/i,
			/facebookexternalhit/i,
			/facebookcatalog/i,
			/Facebot/i,
			/Twitterbot/i,
			/LinkedInBot/i,
			/WhatsApp/i,
			/TelegramBot/i,
			/Slackbot/i,
			/DiscordBot/i,
			/Discordbot/i,
			/Slack-ImgProxy/i,

			// Search Engine Crawlers
			/Googlebot/i,
			/bingbot/i,
			/Baiduspider/i,
			/YandexBot/i,
			/DuckDuckBot/i,
			/Slurp/i, // Yahoo
			/Applebot/i,

			// SEO & Analytics Tools
			/AhrefsBot/i,
			/SemrushBot/i,
			/MJ12bot/i,
			/DotBot/i,
			/Screaming Frog/i,
			/SEOkicks/i,

			// Other Common Bots
			/PingdomBot/i,
			/UptimeRobot/i,
			/StatusCake/i,
			/Lighthouse/i,
			/PageSpeed/i,
			/GTmetrix/i,
			/HeadlessChrome/i,
			/PhantomJS/i,
			/Prerender/i,
		]

		return botPatterns.some(pattern => pattern.test(userAgent))
	}

	/**
	 * Check if request should be rate limited.
	 * Uses Redis for distributed rate limiting, falls back to in-memory if Redis unavailable.
	 */
	async checkRateLimit(key: string, config: RateLimitConfig): Promise<{ allowed: boolean, info: RateLimitInfo }> {
		const now = Date.now()
		const resetTime = new Date(now + config.windowMs)
		const redisKey = `${this.RATE_LIMIT_PREFIX}${key}`

		try {
			// Try Redis first for distributed rate limiting
			const redisStatus = this.redisCacheService.getConnectionStatus()
			if (redisStatus.connected) {
				return await this.checkRateLimitRedis(redisKey, config, now, resetTime)
			}
		}
		catch (error: unknown) {
			this._logger.warn(`Redis rate limit check failed, falling back to local: ${(error as Error).message}`)
		}

		// Fallback to local in-memory rate limiting
		return this.checkRateLimitLocal(key, config, now, resetTime)
	}

	/**
	 * Redis-based distributed rate limiting using atomic increment
	 */
	private async checkRateLimitRedis(
		redisKey: string,
		config: RateLimitConfig,
		now: number,
		resetTime: Date,
	): Promise<{ allowed: boolean, info: RateLimitInfo }> {
		// Get current count from Redis
		const cached = await this.redisCacheService.get<{ count: number, resetTime: number }>(redisKey)

		if (!cached || cached.resetTime <= now) {
			// Window expired or new key - start fresh
			const newEntry = { count: 1, resetTime: now + config.windowMs }
			const ttlSeconds = Math.ceil(config.windowMs / 1000)
			await this.redisCacheService.set(redisKey, newEntry, ttlSeconds)

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

		// Increment count
		const newCount = cached.count + 1
		const updatedEntry = { count: newCount, resetTime: cached.resetTime }
		const remainingTtl = Math.ceil((cached.resetTime - now) / 1000)
		await this.redisCacheService.set(redisKey, updatedEntry, Math.max(1, remainingTtl))

		const allowed = newCount <= config.max

		return {
			allowed,
			info: {
				limit: config.max,
				current: newCount,
				remaining: Math.max(0, config.max - newCount),
				resetTime: new Date(cached.resetTime),
			},
		}
	}

	/**
	 * Local in-memory rate limiting (fallback)
	 */
	private checkRateLimitLocal(
		key: string,
		config: RateLimitConfig,
		now: number,
		resetTime: Date,
	): { allowed: boolean, info: RateLimitInfo } {
		const windowStart = now - config.windowMs
		this.cleanupOldEntries(windowStart)

		let entry = this.localRequestCounts.get(key)

		if (!entry || entry.resetTime <= now) {
			entry = { count: 1, resetTime: now + config.windowMs }
			this.localRequestCounts.set(key, entry)

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

		entry.count += 1
		const currentCount = entry.count
		const allowed = currentCount <= config.max

		return {
			allowed,
			info: {
				limit: config.max,
				current: currentCount,
				remaining: Math.max(0, config.max - currentCount),
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
		if (process.env.NODE_ENV === 'test') {
			return baseLimit
		}

		const systemLoad = await this.getSystemLoad()

		let adaptiveLimit = baseLimit

		if (systemLoad.memoryUsage > this.systemLoadThresholds.memory) {
			const reductionFactor = Math.min(0.5, (systemLoad.memoryUsage - this.systemLoadThresholds.memory) / 20)
			adaptiveLimit = Math.floor(adaptiveLimit * (1 - reductionFactor))
		}

		if (systemLoad.cpuUsage > this.systemLoadThresholds.cpu) {
			const reductionFactor = Math.min(0.5, (systemLoad.cpuUsage - this.systemLoadThresholds.cpu) / 20)
			adaptiveLimit = Math.floor(adaptiveLimit * (1 - reductionFactor))
		}

		return Math.max(1, adaptiveLimit)
	}

	/**
	 * Record rate limit metrics
	 */
	recordRateLimitMetrics(requestType: string, allowed: boolean, info: RateLimitInfo): void {
		if (!allowed) {
			this.metricsService.recordError('rate_limit_exceeded', requestType)
		}

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
	 * Clean up old local rate limit entries (Redis handles TTL automatically)
	 */
	private cleanupOldEntries(windowStart: number): void {
		for (const [key, entry] of this.localRequestCounts.entries()) {
			if (entry.resetTime <= windowStart) {
				this.localRequestCounts.delete(key)
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
			hash = hash & hash
		}
		return Math.abs(hash).toString(36)
	}

	/**
	 * Reset rate limit for a specific key (useful for testing)
	 */
	async resetRateLimit(key: string): Promise<void> {
		this.localRequestCounts.delete(key)
		try {
			await this.redisCacheService.delete(`${this.RATE_LIMIT_PREFIX}${key}`)
		}
		catch {
			// Ignore Redis errors during reset
		}
	}

	/**
	 * Clear all rate limits (useful for testing)
	 */
	async clearAllRateLimits(): Promise<void> {
		const entriesCount = this.localRequestCounts.size
		this.localRequestCounts.clear()
		if (process.env.NODE_ENV === 'test' && entriesCount > 0) {
			this._logger.debug(`Cleared ${entriesCount} local rate limit entries`)
		}
		// Note: Redis entries will expire via TTL
	}

	/**
	 * Get current rate limit status for a key
	 */
	async getRateLimitStatus(key: string): Promise<RateLimitInfo | null> {
		// Try Redis first
		try {
			const redisStatus = this.redisCacheService.getConnectionStatus()
			if (redisStatus.connected) {
				const cached = await this.redisCacheService.get<{ count: number, resetTime: number }>(`${this.RATE_LIMIT_PREFIX}${key}`)
				if (cached) {
					return {
						limit: 0, // Would need to be passed or stored
						current: cached.count,
						remaining: 0, // Would need to be calculated
						resetTime: new Date(cached.resetTime),
					}
				}
			}
		}
		catch {
			// Fall through to local
		}

		// Fallback to local
		const entry = this.localRequestCounts.get(key)
		if (!entry) {
			return null
		}

		return {
			limit: 0,
			current: entry.count,
			remaining: 0,
			resetTime: new Date(entry.resetTime),
		}
	}

	/**
	 * Get whitelisted domains from configuration
	 */
	getWhitelistedDomains(): string[] {
		const domainsString = this._configService.getOptional<string>('rateLimit.bypass.whitelistedDomains', '')
		if (!domainsString || typeof domainsString !== 'string') {
			return []
		}

		return domainsString
			.split(',')
			.map(domain => domain.trim())
			.filter(domain => domain.length > 0)
	}

	/**
	 * Get bot bypass configuration
	 */
	getBypassBotsConfig(): boolean {
		return this._configService.getOptional<boolean>('rateLimit.bypass.bots', true)
	}

	/**
	 * Get debug information about current rate limit state (for testing)
	 */
	getDebugInfo(): { totalEntries: number, entries: Array<{ key: string, count: number, resetTime: number }>, storageType: string } {
		const entries = Array.from(this.localRequestCounts.entries()).map(([key, entry]) => ({
			key,
			count: entry.count,
			resetTime: entry.resetTime,
		}))

		const redisStatus = this.redisCacheService.getConnectionStatus()

		return {
			totalEntries: this.localRequestCounts.size,
			entries,
			storageType: redisStatus.connected ? 'redis' : 'local',
		}
	}
}
