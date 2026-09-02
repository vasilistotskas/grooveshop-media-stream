import type { Redis } from 'ioredis'
import type { RateLimitBucketConfig, RateLimitConfig } from '#microservice/Config/interfaces/app-config.interface'
import * as process from 'node:process'
import * as v8 from 'node:v8'
import { Injectable } from '@nestjs/common'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'

const UA_WHITESPACE_RE = /\s+/g
const VERSION_NUMBER_RE = /\/[\d.]+/g

// One combined regex for bot detection — avoids testing dozens of patterns per request
const BOT_PATTERN_RE = /facebook|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|slack-imgproxy|googlebot|bingbot|baiduspider|yandexbot|duckduckbot|slurp|applebot|ahrefsbot|semrushbot|mj12bot|dotbot|screaming frog|seokicks|pingdombot|uptimerobot|statuscake|lighthouse|pagespeed|gtmetrix|headlesschrome|phantomjs|prerender/i

const RATE_LIMIT_PREFIX = 'ratelimit:'
/** Cap on the in-memory fallback map so rotating IPs cannot grow it without bound. */
const MAX_LOCAL_ENTRIES = 10000
/** Heap-pressure percentage (of V8's heap ceiling) above which the adaptive limit shrinks. */
const MEMORY_PRESSURE_THRESHOLD = 85
/** The limit is reduced by up to 50% as pressure climbs 20 points past the threshold. */
const MAX_REDUCTION_FACTOR = 0.5
const REDUCTION_RANGE_PERCENT = 20
const UA_MAX_LENGTH = 100

/**
 * Atomic INCR + EXPIRE so a crash between the two cannot leave an orphaned
 * counter. Registered with defineCommand so ioredis sends EVALSHA after the
 * first call instead of the script body on every request.
 */
const INCR_EXPIRE_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
	redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`

interface RateLimitRedis extends Redis {
	rateLimitIncr: (key: string, ttlSeconds: number) => Promise<number>
}

export interface RateLimitInfo {
	limit: number
	current: number
	remaining: number
	resetTime: Date
}

export interface RateLimitDecision {
	allowed: boolean
	info: RateLimitInfo
}

/**
 * Distributed rate limiting: a Redis counter shared by every pod, with an
 * in-memory per-process fallback while Redis is unavailable.
 */
@Injectable()
export class RateLimitService {
	private readonly config: RateLimitConfig
	private readonly localRequestCounts = new Map<string, { count: number, resetTime: number }>()
	/** The client instance the Lua command was registered on; re-registered if the client changes. */
	private scriptedClient: Redis | null = null

	constructor(
		configService: ConfigService,
		private readonly metricsService: MetricsService,
		private readonly redisCacheService: RedisCacheService,
	) {
		this.config = configService.get<RateLimitConfig>('rateLimit')
	}

	/**
	 * Image processing is keyed per tenant + IP only: the user agent is
	 * trivially spoofed, and every tenant-scoped request arrives from the same
	 * SSR egress IP, so one tenant's spike must not starve the others. Other
	 * request types add a hashed user agent for finer buckets.
	 */
	generateAdvancedKey(ip: string, userAgent: string, requestType: string, tenantSchema: string = 'public'): string {
		if (requestType === 'image-processing') {
			return `${tenantSchema}:${ip}:${requestType}`
		}

		return `${ip}:${this.hashUserAgent(userAgent || 'unknown')}:${requestType}`
	}

	getRateLimitConfig(requestType: string): RateLimitBucketConfig {
		switch (requestType) {
			case 'image-processing':
				return this.config.imageProcessing
			case 'health-check':
				return this.config.healthCheck
			default:
				return this.config.default
		}
	}

	isBot(userAgent: string): boolean {
		return userAgent.length > 0 && BOT_PATTERN_RE.test(userAgent)
	}

	/**
	 * Redis first (distributed), in-memory fallback when Redis is down or the
	 * command fails.
	 */
	async checkRateLimit(key: string, config: RateLimitBucketConfig): Promise<RateLimitDecision> {
		const now = Date.now()
		const resetTime = new Date(now + config.windowMs)

		try {
			const client = this.redisCacheService.getClient()
			if (client) {
				return await this.checkRateLimitRedis(client, `${RATE_LIMIT_PREFIX}${key}`, config, resetTime)
			}
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Redis rate limit check failed, falling back to local: ${errorMessage(error)}`, RateLimitService.name)
		}

		return this.checkRateLimitLocal(key, config, now, resetTime)
	}

	private async checkRateLimitRedis(
		client: Redis,
		redisKey: string,
		config: RateLimitBucketConfig,
		resetTime: Date,
	): Promise<RateLimitDecision> {
		if (client !== this.scriptedClient) {
			client.defineCommand('rateLimitIncr', { numberOfKeys: 1, lua: INCR_EXPIRE_LUA })
			this.scriptedClient = client
		}

		const ttlSeconds = Math.ceil(config.windowMs / 1000)
		const currentCount = await (client as RateLimitRedis).rateLimitIncr(redisKey, ttlSeconds)

		return this.decision(config, currentCount, resetTime)
	}

	private checkRateLimitLocal(key: string, config: RateLimitBucketConfig, now: number, resetTime: Date): RateLimitDecision {
		this.cleanupOldEntries(now - config.windowMs)

		const entry = this.localRequestCounts.get(key)
		if (!entry || entry.resetTime <= now) {
			this.localRequestCounts.set(key, { count: 1, resetTime: now + config.windowMs })
			return this.decision(config, 1, resetTime)
		}

		entry.count += 1
		return this.decision(config, entry.count, new Date(entry.resetTime))
	}

	private decision(config: RateLimitBucketConfig, currentCount: number, resetTime: Date): RateLimitDecision {
		return {
			allowed: currentCount <= config.max,
			info: {
				limit: config.max,
				current: currentCount,
				remaining: Math.max(0, config.max - currentCount),
				resetTime,
			},
		}
	}

	/**
	 * Heap pressure = heapUsed against V8's actual ceiling (`heap_size_limit`),
	 * NOT heapTotal: V8 grows heapTotal lazily, so heapUsed/heapTotal reads
	 * >85% during normal GC churn and would keep the limiter throttled forever.
	 */
	getHeapPressurePercent(): number {
		const heapLimit = v8.getHeapStatistics().heap_size_limit
		return (process.memoryUsage().heapUsed / heapLimit) * 100
	}

	async calculateAdaptiveLimit(baseLimit: number): Promise<number> {
		const pressure = this.getHeapPressurePercent()

		let adaptiveLimit = baseLimit
		if (pressure > MEMORY_PRESSURE_THRESHOLD) {
			const reductionFactor = Math.min(MAX_REDUCTION_FACTOR, (pressure - MEMORY_PRESSURE_THRESHOLD) / REDUCTION_RANGE_PERCENT)
			adaptiveLimit = Math.floor(adaptiveLimit * (1 - reductionFactor))
		}

		return Math.max(1, adaptiveLimit)
	}

	recordRateLimitMetrics(requestType: string, allowed: boolean, info: RateLimitInfo): void {
		if (!allowed) {
			this.metricsService.recordError('rate_limit_exceeded', requestType)
			CorrelatedLogger.debug(`Rate limit exceeded for ${requestType}: ${info.current}/${info.limit}`, RateLimitService.name)
		}
	}

	/** Drop expired local entries and cap the map (Redis handles TTL itself). */
	private cleanupOldEntries(windowStart: number): void {
		for (const [key, entry] of this.localRequestCounts) {
			if (entry.resetTime <= windowStart) {
				this.localRequestCounts.delete(key)
			}
		}

		if (this.localRequestCounts.size > MAX_LOCAL_ENTRIES) {
			const excess = this.localRequestCounts.size - MAX_LOCAL_ENTRIES
			const iterator = this.localRequestCounts.keys()
			for (let i = 0; i < excess; i++) {
				const { value } = iterator.next()
				if (value === undefined) {
					break
				}
				this.localRequestCounts.delete(value)
			}
		}
	}

	/** Normalise (case, whitespace, version numbers) then hash so similar browsers share a bucket. */
	private hashUserAgent(userAgent: string): string {
		const normalized = userAgent
			.toLowerCase()
			.replace(UA_WHITESPACE_RE, ' ')
			.trim()
			.replace(VERSION_NUMBER_RE, '')
			.substring(0, UA_MAX_LENGTH)

		let hash = 0
		for (let i = 0; i < normalized.length; i++) {
			hash = ((hash << 5) - hash) + normalized.charCodeAt(i)
			hash &= hash
		}
		return Math.abs(hash).toString(36)
	}
}
