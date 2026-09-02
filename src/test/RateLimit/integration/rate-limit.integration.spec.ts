import type { INestApplication } from '@nestjs/common'
import { Controller, Get, UseGuards } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { ConfigModule } from '#microservice/Config/config.module'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import { AdaptiveRateLimitGuard } from '#microservice/RateLimit/guards/adaptive-rate-limit.guard'
import { RateLimitModule } from '#microservice/RateLimit/rate-limit.module'
import { RateLimitService } from '#microservice/RateLimit/services/rate-limit.service'

// Both the guard and RateLimitService read `rateLimit` once at construction,
// so the limits are fixed through the environment before the module compiles;
// per-test window/limit changes go through a `getRateLimitConfig` spy instead.
const DEFAULT_LIMIT = 12
const IMAGE_LIMIT = 8

// Uses the media_stream-image prefix so the guard classifies the route as
// image-processing; every route carries the guard the way APP_GUARD does in
// production, so the health bypass is actually exercised.
@Controller()
class TestController {
	@Get('media_stream-image/test-image')
	@UseGuards(AdaptiveRateLimitGuard)
	imageProcessing() {
		return { message: 'Image processed' }
	}

	@Get('health')
	@UseGuards(AdaptiveRateLimitGuard)
	health() {
		return { status: 'ok' }
	}

	@Get('test/default')
	@UseGuards(AdaptiveRateLimitGuard)
	defaultEndpoint() {
		return { message: 'Default endpoint' }
	}
}

describe('rate Limiting Integration', () => {
	let app: INestApplication
	let rateLimitService: RateLimitService
	let redisCacheService: RedisCacheService

	/** All supertest requests share one socket IP and UA, so counters must be reset between tests. */
	async function flushRateLimitKeys(): Promise<void> {
		await redisCacheService.getClient()?.flushdb()
	}

	async function exhaust(path: string, limit: number): Promise<void> {
		for (let i = 0; i < limit; i++) {
			const response = await request(app.getHttpServer()).get(path)
			expect(response.status, `request ${i + 1}/${limit} to ${path}`).toBe(200)
		}
	}

	beforeEach(async () => {
		vi.stubEnv('RATE_LIMIT_ENABLED', 'true')
		vi.stubEnv('RATE_LIMIT_DEFAULT_WINDOW_MS', '60000')
		vi.stubEnv('RATE_LIMIT_DEFAULT_MAX', String(DEFAULT_LIMIT))
		vi.stubEnv('RATE_LIMIT_IMAGE_PROCESSING_WINDOW_MS', '60000')
		vi.stubEnv('RATE_LIMIT_IMAGE_PROCESSING_MAX', String(IMAGE_LIMIT))
		vi.stubEnv('RATE_LIMIT_BYPASS_HEALTH_CHECKS', 'true')
		vi.stubEnv('MONITORING_ENABLED', 'false')

		const moduleFixture = await Test.createTestingModule({
			imports: [
				ConfigModule,
				MetricsModule,
				ScheduleModule.forRoot(),
				RateLimitModule,
			],
			controllers: [TestController],
		}).compile()

		app = moduleFixture.createNestApplication()
		rateLimitService = moduleFixture.get(RateLimitService)
		redisCacheService = moduleFixture.get(RedisCacheService)

		// Listen once so concurrent supertest calls share a server instead of
		// each spinning one up and tearing it down under the others.
		await app.listen(0, '127.0.0.1')
		await flushRateLimitKeys()
	})

	afterEach(async () => {
		await flushRateLimitKeys()
		await app.close()
		vi.restoreAllMocks()
		vi.unstubAllEnvs()
	})

	describe('basic Rate Limiting', () => {
		it('should allow requests within rate limit', async () => {
			const response = await request(app.getHttpServer())
				.get('/test/default')
				.expect(200)

			expect(response.headers['x-ratelimit-limit']).toBe(String(DEFAULT_LIMIT))
			expect(response.headers['x-ratelimit-remaining']).toBe(String(DEFAULT_LIMIT - 1))
			expect(response.headers['x-ratelimit-reset']).toBeDefined()
		})

		it('should block requests when rate limit is exceeded', async () => {
			await exhaust('/test/default', DEFAULT_LIMIT)

			const response = await request(app.getHttpServer())
				.get('/test/default')
				.expect(429)

			expect(response.headers['x-ratelimit-remaining']).toBe('0')
			expect(Number(response.headers['retry-after'])).toBeGreaterThanOrEqual(1)
		})

		// eslint-disable-next-line test/expect-expect
		it('should reset rate limit after window expires', async () => {
			vi.spyOn(rateLimitService, 'getRateLimitConfig').mockReturnValue({ windowMs: 100, max: 2 })

			await request(app.getHttpServer()).get('/test/default').expect(200)
			await request(app.getHttpServer()).get('/test/default').expect(200)
			await request(app.getHttpServer()).get('/test/default').expect(429)

			// The Redis key TTL is ceil(100ms / 1000) = 1 second
			await new Promise(resolve => setTimeout(resolve, 1200))

			await request(app.getHttpServer()).get('/test/default').expect(200)
		}, 10_000)
	})

	describe('request Type Specific Limits', () => {
		it('should apply different limits for image processing requests', async () => {
			await exhaust('/media_stream-image/test-image', IMAGE_LIMIT)

			const response = await request(app.getHttpServer()).get('/media_stream-image/test-image')

			expect(response.status).toBe(429)
		})

		it('should track different request types independently', async () => {
			await exhaust('/media_stream-image/test-image', IMAGE_LIMIT)

			// Default endpoint should still work (different limit and different request type)
			const defaultResponse = await request(app.getHttpServer()).get('/test/default')

			expect(defaultResponse.status).toBe(200)
		})
	})

	describe('health Check Bypass', () => {
		// eslint-disable-next-line test/expect-expect
		it('should bypass rate limiting for health checks', async () => {
			await exhaust('/test/default', DEFAULT_LIMIT)

			await request(app.getHttpServer()).get('/test/default').expect(429)

			// Health checks are guarded too, yet skip the throttle entirely
			await request(app.getHttpServer()).get('/health').expect(200)
		})
	})

	describe('iP-based Rate Limiting', () => {
		// eslint-disable-next-line test/expect-expect
		it('should use socket IP for rate limiting (X-Forwarded-For not trusted)', async () => {
			await exhaust('/test/default', DEFAULT_LIMIT)

			await request(app.getHttpServer()).get('/test/default').expect(429)

			// The guard keys on request.ip / socket.remoteAddress, so a forged
			// X-Forwarded-For does not open a fresh bucket.
			await request(app.getHttpServer())
				.get('/test/default')
				.set('X-Forwarded-For', '192.168.100.99')
				.expect(429)
		})

		it('should use socket IP and ignore X-Forwarded-For / X-Real-IP headers', async () => {
			const response1 = await request(app.getHttpServer())
				.get('/test/default')
				.set('X-Forwarded-For', '192.168.100.9,192.168.100.10')
				.expect(200)

			const response2 = await request(app.getHttpServer())
				.get('/test/default')
				.set('X-Real-IP', '192.168.100.11')
				.expect(200)

			// Both requests share the same counter since the headers are ignored
			const remaining1 = Number(response1.headers['x-ratelimit-remaining'])
			const remaining2 = Number(response2.headers['x-ratelimit-remaining'])
			expect(remaining2).toBe(remaining1 - 1)
		})
	})

	describe('rate Limit Headers', () => {
		it('should include proper rate limit headers in response', async () => {
			const response = await request(app.getHttpServer())
				.get('/test/default')
				.expect(200)

			expect(response.headers['x-ratelimit-limit']).toBeDefined()
			expect(response.headers['x-ratelimit-remaining']).toBeDefined()
			expect(response.headers['x-ratelimit-used']).toBeDefined()
			expect(response.headers['x-ratelimit-reset']).toBeDefined()

			expect(Number(response.headers['x-ratelimit-limit'])).toBeGreaterThan(0)
			expect(Number(response.headers['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(0)
			expect(Number(response.headers['x-ratelimit-used'])).toBeGreaterThan(0)
		})

		it('should update headers correctly with multiple requests', async () => {
			let response = await request(app.getHttpServer()).get('/test/default').expect(200)
			const firstRemaining = Number(response.headers['x-ratelimit-remaining'])
			const firstUsed = Number(response.headers['x-ratelimit-used'])

			response = await request(app.getHttpServer()).get('/test/default').expect(200)
			const secondRemaining = Number(response.headers['x-ratelimit-remaining'])
			const secondUsed = Number(response.headers['x-ratelimit-used'])

			expect(secondRemaining).toBe(firstRemaining - 1)
			expect(secondUsed).toBe(firstUsed + 1)
		})
	})

	describe('adaptive Rate Limiting', () => {
		it('should reduce limits under high heap pressure', async () => {
			vi.spyOn(rateLimitService, 'getHeapPressurePercent').mockReturnValue(90)

			const adaptiveLimit = await rateLimitService.calculateAdaptiveLimit(5)

			expect(adaptiveLimit).toBeLessThan(5)
			expect(adaptiveLimit).toBeGreaterThanOrEqual(1)
		})

		it('should maintain limits under normal heap pressure', async () => {
			vi.spyOn(rateLimitService, 'getHeapPressurePercent').mockReturnValue(60)

			await expect(rateLimitService.calculateAdaptiveLimit(5)).resolves.toBe(5)
		})
	})

	describe('error Handling', () => {
		it('should handle rate limit service errors gracefully (fail open)', async () => {
			vi.spyOn(rateLimitService, 'checkRateLimit').mockRejectedValue(new Error('Service error'))

			const response = await request(app.getHttpServer())
				.get('/test/default')
				.expect(200)

			expect(response.headers['x-ratelimit-limit']).toBeUndefined()
		})
	})

	describe('concurrent Requests', () => {
		it('should count concurrent requests atomically', async () => {
			vi.spyOn(rateLimitService, 'getRateLimitConfig').mockReturnValue({ windowMs: 60_000, max: 3 })
			const concurrentRequests = 6

			const responses = await Promise.all(
				Array.from({ length: concurrentRequests }, () => request(app.getHttpServer()).get('/test/default')),
			)

			const statuses = responses.map(response => response.status)
			// INCR+EXPIRE runs as one Lua script, so exactly `max` requests win
			// no matter how they interleave; nothing errors out.
			expect(statuses.filter(status => status === 200)).toHaveLength(3)
			expect(statuses.filter(status => status === 429)).toHaveLength(concurrentRequests - 3)
		}, 20_000)
	})
})
