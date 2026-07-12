import * as process from 'node:process'
import * as v8 from 'node:v8'
import { Injectable } from '@nestjs/common'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'

const UA_WHITESPACE_RE = /\s+/g
const VERSION_NUMBER_RE = /\/[\d.]+/g

// Single combined regex for bot detection — avoids testing 42 individual patterns per request
// Single combined regex for bot detection — avoids testing many individual patterns per request
const BOT_PATTERN_RE = /facebook|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|slack-imgproxy|googlebot|bingbot|baiduspider|yandexbot|duckduckbot|slurp|applebot|ahrefsbot|semrushbot|mj12bot|dotbot|screaming frog|seokicks|pingdombot|uptimerobot|statuscake|lighthouse|pagespeed|gtmetrix|headlesschrome|phantomjs|prerender/i

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
	memoryUsage: number
}

/**
 * Distributed rate limiting service using Redis for horizontal scaling.
 * Falls back to in-memory storage if Redis is unavailable.
 */
@Injectable()
export class RateLimitService {
	/** In-memory fallback when Redis is unavailable */
	private readonly localRequestCounts = new Map<string, { count: number, resetTime: number }>()
	private readonly MAX_LOCAL_ENTRIES = 10000
	/** Heap-pressure percentage above which the adaptive limit shrinks */
	private readonly MEMORY_PRESSURE_THRESHOLD = 85

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
	 * For critical endpoints (image-processing), use IP-only to prevent UA spoofing bypass
	 */
	generateAdvancedKey(ip: string, userAgent: string, requestType: string): string {
		// For image processing, use IP-only key to prevent user-agent spoofing bypass
		// This is a security measure as user-agent can be easily spoofed
		if (requestType === 'image-processing') {
			return `${ip}:${requestType}`
		}

		// For other request types, include hashed user-agent for more granular control
		// This allows different rate limits for different clients from the same IP
		const userAgentHash = this.hashUserAgent(userAgent || 'unknown')
		return `${ip}:${userAgentHash}:${requestType}`
	}

	/**
	 * Generate a secure hash of the user agent
	 * Uses a more robust hashing approach than simple hash
	 */
	private hashUserAgent(userAgent: string): string {
		// Normalize user agent to reduce variations
		const normalized = userAgent
			.toLowerCase()
			.replace(UA_WHITESPACE_RE, ' ')
			.trim()
			// Remove version numbers to group similar browsers
			.replace(VERSION_NUMBER_RE, '')
			.substring(0, 100) // Limit length

		return this.simpleHash(normalized)
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
	 * Check if user agent is a known bot/crawler
	 */
	isBot(userAgent: string): boolean {
		if (!userAgent) {
			return false
		}

		return BOT_PATTERN_RE.test(userAgent)
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
			CorrelatedLogger.warn(`Redis rate limit check failed, falling back to local: ${(error as Error).message}`, RateLimitService.name)
		}

		// Fallback to local in-memory rate limiting
		return this.checkRateLimitLocal(key, config, now, resetTime)
	}

	/**
	 * Redis-based distributed rate limiting using atomic Lua script.
	 * INCR + EXPIRE are executed atomically to prevent orphaned keys on crash.
	 */
	private async checkRateLimitRedis(
		redisKey: string,
		config: RateLimitConfig,
		_now: number,
		resetTime: Date,
	): Promise<{ allowed: boolean, info: RateLimitInfo }> {
		const client = this.redisCacheService.getClient()
		if (!client) {
			throw new Error('Redis client not available')
		}

		const ttlSeconds = Math.ceil(config.windowMs / 1000)

		// Atomic INCR + EXPIRE via Lua to prevent orphaned keys
		const luaScript = `
			local current = redis.call('INCR', KEYS[1])
			if current == 1 then
				redis.call('EXPIRE', KEYS[1], ARGV[1])
			end
			return current
		`
		const currentCount = await client.eval(luaScript, 1, redisKey, ttlSeconds) as number

		const allowed = currentCount <= config.max

		return {
			allowed,
			info: {
				limit: config.max,
				current: currentCount,
				remaining: Math.max(0, config.max - currentCount),
				resetTime,
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
	 * Get current system load for adaptive rate limiting.
	 *
	 * Memory pressure is heapUsed against V8's actual heap ceiling
	 * (`heap_size_limit` ≈ --max-old-space-size), NOT heapTotal: V8 grows
	 * heapTotal lazily, so heapUsed/heapTotal routinely reads >85% during
	 * normal GC churn and would keep the adaptive limiter permanently
	 * throttled. Same rationale as the /health/live heap check.
	 */
	async getSystemLoad(): Promise<SystemLoadInfo> {
		const heapLimit = v8.getHeapStatistics().heap_size_limit
		const memoryUsagePercent = (process.memoryUsage().heapUsed / heapLimit) * 100

		return {
			memoryUsage: memoryUsagePercent,
		}
	}

	/**
	 * Calculate adaptive rate limit based on heap pressure
	 */
	async calculateAdaptiveLimit(baseLimit: number): Promise<number> {
		if (process.env.NODE_ENV === 'test') {
			return baseLimit
		}

		const systemLoad = await this.getSystemLoad()

		let adaptiveLimit = baseLimit

		if (systemLoad.memoryUsage > this.MEMORY_PRESSURE_THRESHOLD) {
			const reductionFactor = Math.min(0.5, (systemLoad.memoryUsage - this.MEMORY_PRESSURE_THRESHOLD) / 20)
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
			CorrelatedLogger.debug(`Rate limit exceeded for ${requestType}: ${info.current}/${info.limit}`, RateLimitService.name)
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
		// Cap the map size to prevent unbounded growth under DDoS with rotating IPs
		if (this.localRequestCounts.size > this.MAX_LOCAL_ENTRIES) {
			const excess = this.localRequestCounts.size - this.MAX_LOCAL_ENTRIES
			const iter = this.localRequestCounts.keys()
			for (let i = 0; i < excess; i++) {
				const { value } = iter.next()
				if (value)
					this.localRequestCounts.delete(value)
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
			CorrelatedLogger.debug(`Cleared ${entriesCount} local rate limit entries`, RateLimitService.name)
		}
		// Note: Redis entries will expire via TTL
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
	 * Operator kill-switch: RATE_LIMIT_ENABLED=false disables all rate limiting
	 */
	isEnabled(): boolean {
		return this._configService.getOptional<boolean>('rateLimit.enabled', true)
	}

	/**
	 * Whether health endpoints bypass rate limiting (K8s probes fire every few seconds)
	 */
	getBypassHealthChecksConfig(): boolean {
		return this._configService.getOptional<boolean>('rateLimit.bypass.healthChecks', true)
	}

	/**
	 * Whether static assets bypass rate limiting
	 */
	getBypassStaticAssetsConfig(): boolean {
		return this._configService.getOptional<boolean>('rateLimit.bypass.staticAssets', true)
	}
}
