import type { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import type { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitService } from '#microservice/RateLimit/services/rate-limit.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

/** Deliberately non-default values so the tests prove the schema wiring, not the defaults. */
const CONFIG_OVERRIDES = {
	'rateLimit.default.windowMs': 30_000,
	'rateLimit.default.max': 120,
	'rateLimit.imageProcessing.windowMs': 45_000,
	'rateLimit.imageProcessing.max': 40,
	'rateLimit.healthCheck.windowMs': 5_000,
	'rateLimit.healthCheck.max': 900,
}

function createRedisClientMock(incrResult: number | Error) {
	return {
		defineCommand: vi.fn(),
		rateLimitIncr: incrResult instanceof Error
			? vi.fn().mockRejectedValue(incrResult)
			: vi.fn().mockResolvedValue(incrResult),
	}
}

describe('rateLimitService', () => {
	let service: RateLimitService
	let metricsService: { recordError: ReturnType<typeof vi.fn> }
	let redisCacheService: { getClient: ReturnType<typeof vi.fn> }

	beforeEach(() => {
		metricsService = { recordError: vi.fn() }
		redisCacheService = { getClient: vi.fn().mockReturnValue(null) }
		service = new RateLimitService(
			createConfigServiceMock(CONFIG_OVERRIDES),
			metricsService as unknown as MetricsService,
			redisCacheService as unknown as RedisCacheService,
		)
	})

	describe('generateAdvancedKey', () => {
		it('should generate an advanced key with the default (public) tenant schema when none is given', () => {
			// For image-processing endpoint, we use IP-only (+ tenant schema) to prevent UA spoofing bypass
			const key = service.generateAdvancedKey('192.168.1.1', 'Mozilla/5.0', 'image-processing')
			expect(key).toBe('public:192.168.1.1:image-processing')
		})

		it('should handle empty user agent', () => {
			const key = service.generateAdvancedKey('192.168.1.1', '', 'image-processing')
			expect(key).toBe('public:192.168.1.1:image-processing')
		})

		it('should include the tenant schema in the image-processing key so tenants get independent buckets', () => {
			const acmeKey = service.generateAdvancedKey('192.168.1.1', 'Mozilla/5.0', 'image-processing', 'acme')
			const otherKey = service.generateAdvancedKey('192.168.1.1', 'Mozilla/5.0', 'image-processing', 'other_tenant')

			expect(acmeKey).toBe('acme:192.168.1.1:image-processing')
			expect(otherKey).toBe('other_tenant:192.168.1.1:image-processing')
			// Same IP, different tenant -> different bucket key, so one tenant's
			// spike cannot starve another tenant sharing the same egress IP.
			expect(acmeKey).not.toBe(otherKey)
		})

		it('should include user agent hash for non-image-processing endpoints (tenant schema is ignored)', () => {
			const key = service.generateAdvancedKey('192.168.1.1', 'Mozilla/5.0', 'default', 'acme')
			expect(key).toMatch(/^192\.168\.1\.1:[a-z0-9]+:default$/)
		})

		it('should hash user agents that differ only in version numbers, case or whitespace into the same bucket', () => {
			const chrome120 = service.generateAdvancedKey('192.168.1.1', 'Mozilla/5.0 Chrome/120.0.6099', 'default')
			const chrome121 = service.generateAdvancedKey('192.168.1.1', 'mozilla/5.0   chrome/121.0.6167', 'default')
			const firefox = service.generateAdvancedKey('192.168.1.1', 'Mozilla/5.0 Firefox/121.0', 'default')

			expect(chrome121).toBe(chrome120)
			expect(firefox).not.toBe(chrome120)
		})
	})

	describe('getRateLimitConfig', () => {
		it('should return default config for unknown request type', () => {
			expect(service.getRateLimitConfig('unknown')).toEqual({ windowMs: 30_000, max: 120 })
		})

		it('should return image processing config', () => {
			expect(service.getRateLimitConfig('image-processing')).toEqual({ windowMs: 45_000, max: 40 })
		})

		it('should return health check config', () => {
			expect(service.getRateLimitConfig('health-check')).toEqual({ windowMs: 5_000, max: 900 })
		})
	})

	describe('checkRateLimit (in-memory fallback, no Redis client)', () => {
		const mockConfig = { windowMs: 60_000, max: 5 }

		it('should allow first request', async () => {
			const result = await service.checkRateLimit('test-key', mockConfig)

			expect(result.allowed).toBe(true)
			expect(result.info.current).toBe(1)
			expect(result.info.remaining).toBe(4)
			expect(result.info.limit).toBe(5)
		})

		it('should track multiple requests', async () => {
			await service.checkRateLimit('test-key', mockConfig)

			const result = await service.checkRateLimit('test-key', mockConfig)

			expect(result.allowed).toBe(true)
			expect(result.info.current).toBe(2)
			expect(result.info.remaining).toBe(3)
		})

		it('should block requests when limit exceeded', async () => {
			for (let i = 0; i < 5; i++) {
				await service.checkRateLimit('test-key', mockConfig)
			}

			const result = await service.checkRateLimit('test-key', mockConfig)

			expect(result.allowed).toBe(false)
			expect(result.info.current).toBe(6)
			expect(result.info.remaining).toBe(0)
		})

		it('should reset after window expires', async () => {
			const shortConfig = { ...mockConfig, windowMs: 100 }

			await service.checkRateLimit('test-key', shortConfig)
			await new Promise(resolve => setTimeout(resolve, 150))

			const result = await service.checkRateLimit('test-key', shortConfig)
			expect(result.allowed).toBe(true)
			expect(result.info.current).toBe(1)
		})

		it('should handle different keys independently', async () => {
			await service.checkRateLimit('key1', mockConfig)
			const result = await service.checkRateLimit('key2', mockConfig)

			expect(result.allowed).toBe(true)
			expect(result.info.current).toBe(1)
		})
	})

	describe('checkRateLimit (Redis)', () => {
		const mockConfig = { windowMs: 60_000, max: 5 }

		it('should register the Lua command once per client and use its INCR result', async () => {
			const client = createRedisClientMock(3)
			redisCacheService.getClient.mockReturnValue(client)

			await service.checkRateLimit('test-key', mockConfig)
			const result = await service.checkRateLimit('test-key', mockConfig)

			expect(client.defineCommand).toHaveBeenCalledTimes(1)
			expect(client.defineCommand).toHaveBeenCalledWith('rateLimitIncr', {
				numberOfKeys: 1,
				lua: expect.stringContaining('INCR'),
			})
			expect(client.rateLimitIncr).toHaveBeenCalledTimes(2)
			expect(client.rateLimitIncr).toHaveBeenCalledWith('ratelimit:test-key', 60)
			expect(result.allowed).toBe(true)
			expect(result.info.current).toBe(3)
			expect(result.info.remaining).toBe(2)
			expect(result.info.limit).toBe(5)
		})

		it('should block when the shared counter exceeds the limit', async () => {
			redisCacheService.getClient.mockReturnValue(createRedisClientMock(6))

			const result = await service.checkRateLimit('test-key', mockConfig)

			expect(result.allowed).toBe(false)
			expect(result.info.current).toBe(6)
			expect(result.info.remaining).toBe(0)
		})

		it('should re-register the Lua command when the client instance changes (reconnect)', async () => {
			const first = createRedisClientMock(1)
			const second = createRedisClientMock(1)
			redisCacheService.getClient.mockReturnValueOnce(first).mockReturnValueOnce(second)

			await service.checkRateLimit('test-key', mockConfig)
			await service.checkRateLimit('test-key', mockConfig)

			expect(first.defineCommand).toHaveBeenCalledTimes(1)
			expect(second.defineCommand).toHaveBeenCalledTimes(1)
		})

		it('should fall back to the in-memory counter when the Redis command rejects', async () => {
			const client = createRedisClientMock(new Error('READONLY'))
			redisCacheService.getClient.mockReturnValue(client)

			const first = await service.checkRateLimit('test-key', mockConfig)
			const second = await service.checkRateLimit('test-key', mockConfig)

			// Redis is retried on every call rather than being marked dead
			expect(client.rateLimitIncr).toHaveBeenCalledTimes(2)
			expect(first.allowed).toBe(true)
			expect(first.info.current).toBe(1)
			expect(second.info.current).toBe(2)
		})
	})

	describe('getHeapPressurePercent', () => {
		it('should report heap pressure against the V8 heap ceiling', () => {
			const pressure = service.getHeapPressurePercent()

			expect(typeof pressure).toBe('number')
			// heapUsed / heap_size_limit: a healthy test process sits far below
			// its heap ceiling (heapUsed/heapTotal would routinely read >85%).
			expect(pressure).toBeGreaterThan(0)
			expect(pressure).toBeLessThan(85)
		})
	})

	describe('calculateAdaptiveLimit', () => {
		it('should return the base limit while heap pressure is at or below the threshold', async () => {
			vi.spyOn(service, 'getHeapPressurePercent').mockReturnValue(60)

			await expect(service.calculateAdaptiveLimit(100)).resolves.toBe(100)
		})

		it('should reduce the limit proportionally above 85% pressure', async () => {
			// 90% is 5 points past the threshold: 5/20 = 25% reduction
			vi.spyOn(service, 'getHeapPressurePercent').mockReturnValue(90)

			await expect(service.calculateAdaptiveLimit(100)).resolves.toBe(75)
		})

		it('should cap the reduction at 50%', async () => {
			vi.spyOn(service, 'getHeapPressurePercent').mockReturnValue(120)

			await expect(service.calculateAdaptiveLimit(100)).resolves.toBe(50)
		})

		it('should ensure minimum limit of 1', async () => {
			vi.spyOn(service, 'getHeapPressurePercent').mockReturnValue(95)

			await expect(service.calculateAdaptiveLimit(1)).resolves.toBe(1)
		})
	})

	describe('recordRateLimitMetrics', () => {
		it('should record metrics for allowed requests', () => {
			const info = { limit: 100, current: 1, remaining: 99, resetTime: new Date() }

			service.recordRateLimitMetrics('image-processing', true, info)

			expect(metricsService.recordError).not.toHaveBeenCalled()
		})

		it('should record metrics for blocked requests', () => {
			const info = { limit: 100, current: 101, remaining: 0, resetTime: new Date() }

			service.recordRateLimitMetrics('image-processing', false, info)

			expect(metricsService.recordError).toHaveBeenCalledWith('rate_limit_exceeded', 'image-processing')
		})
	})

	describe('isBot', () => {
		it('should detect Facebook bot', () => {
			expect(service.isBot('facebookexternalhit/1.1')).toBe(true)
			expect(service.isBot('Facebot')).toBe(true)
			expect(service.isBot('facebookcatalog/1.0')).toBe(true)
		})

		it('should detect Twitter bot', () => {
			expect(service.isBot('Twitterbot/1.0')).toBe(true)
		})

		it('should detect LinkedIn bot', () => {
			expect(service.isBot('LinkedInBot/1.0')).toBe(true)
		})

		it('should detect search engine bots', () => {
			expect(service.isBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true)
			expect(service.isBot('Mozilla/5.0 (compatible; bingbot/2.0)')).toBe(true)
			expect(service.isBot('Mozilla/5.0 (compatible; YandexBot/3.0)')).toBe(true)
		})

		it('should detect SEO tool bots', () => {
			expect(service.isBot('AhrefsBot/7.0')).toBe(true)
			expect(service.isBot('SemrushBot/7~bl')).toBe(true)
		})

		it('should detect monitoring bots', () => {
			expect(service.isBot('PingdomBot/1.0')).toBe(true)
			expect(service.isBot('UptimeRobot/2.0')).toBe(true)
		})

		it('should not detect regular browsers as bots', () => {
			expect(service.isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe(false)
			expect(service.isBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false)
		})

		it('should not treat an empty user agent as a bot', () => {
			expect(service.isBot('')).toBe(false)
		})
	})
})
