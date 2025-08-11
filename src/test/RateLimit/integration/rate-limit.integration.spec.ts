import { ConfigModule } from '@microservice/Config/config.module'
import { ConfigService } from '@microservice/Config/config.service'
import { MetricsModule } from '@microservice/Metrics/metrics.module'
import { AdaptiveRateLimitGuard } from '@microservice/RateLimit/guards/adaptive-rate-limit.guard'
import { RateLimitModule } from '@microservice/RateLimit/rate-limit.module'
import { RateLimitService } from '@microservice/RateLimit/services/rate-limit.service'
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common'

import { Test, TestingModule } from '@nestjs/testing'
import { ThrottlerModule } from '@nestjs/throttler'
import request from 'supertest'

// Test controller for integration testing
@Controller('test')
class TestController {
	@Get('image-processing')
	@UseGuards(AdaptiveRateLimitGuard)
	async imageProcessing() {
		return { message: 'Image processed' }
	}

	@Get('health')
	async health() {
		return { status: 'ok' }
	}

	@Get('default')
	@UseGuards(AdaptiveRateLimitGuard)
	async defaultEndpoint() {
		return { message: 'Default endpoint' }
	}
}

describe('rate Limiting Integration', () => {
	let app: INestApplication
	let rateLimitService: RateLimitService
	let configService: ConfigService

	beforeEach(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [
				ConfigModule,
				MetricsModule,
				ThrottlerModule.forRoot([
					{
						name: 'default',
						ttl: 60000,
						limit: 5, // Low limit for testing
					},
				]),
				RateLimitModule,
			],
			controllers: [TestController],
			providers: [
				// Don't use global guard for testing - apply manually to test controller
			],
		}).compile()

		app = moduleFixture.createNestApplication()
		rateLimitService = moduleFixture.get<RateLimitService>(RateLimitService)
		configService = moduleFixture.get<ConfigService>(ConfigService)

		// Mock configuration for testing
		jest.spyOn(configService, 'getOptional').mockImplementation((key: string, defaultValue?: any) => {
			const configs = {
				'rateLimit.default.windowMs': 60000,
				'rateLimit.default.max': 10, // Increased for more reliable testing
				'rateLimit.imageProcessing.windowMs': 60000,
				'rateLimit.imageProcessing.max': 5, // Increased for more reliable testing
				'rateLimit.healthCheck.windowMs': 10000,
				'rateLimit.healthCheck.max': 100,
				'monitoring.enabled': true,
			}
			return configs[key] || defaultValue
		})

		await app.init()

		// Clear any existing rate limit data before each test
		const rateLimitServicePrivate = rateLimitService as any
		if (rateLimitServicePrivate.requestCounts) {
			rateLimitServicePrivate.requestCounts.clear()
		}
	})

	afterEach(async () => {
		// Clear rate limit data after each test
		const rateLimitServicePrivate = rateLimitService as any
		if (rateLimitServicePrivate.requestCounts) {
			rateLimitServicePrivate.requestCounts.clear()
		}

		await app.close()
		jest.clearAllMocks()
	})

	describe('basic Rate Limiting', () => {
		it('should allow requests within rate limit', async () => {
			const response = await request(app.getHttpServer())
				.get('/test/default')
				.expect(200)

			expect(response.headers['x-ratelimit-limit']).toBeDefined()
			expect(response.headers['x-ratelimit-remaining']).toBeDefined()
			expect(response.headers['x-ratelimit-reset']).toBeDefined()
		})

		it('should block requests when rate limit is exceeded', async () => {
			// Make requests up to the limit
			for (let i = 0; i < 10; i++) {
				await request(app.getHttpServer())
					.get('/test/default')
					.expect(200)
			}

			// Next request should be blocked
			await request(app.getHttpServer())
				.get('/test/default')
				.expect(429) // Too Many Requests
		})

		it('should reset rate limit after window expires', async () => {
			// Clear any existing rate limits first
			const rateLimitServicePrivate = rateLimitService as any
			if (rateLimitServicePrivate.requestCounts) {
				rateLimitServicePrivate.requestCounts.clear()
			}

			// Mock short window for testing
			jest.spyOn(configService, 'getOptional').mockImplementation((key: string, defaultValue?: any) => {
				if (key === 'rateLimit.default.windowMs')
					return 100 // 100ms window
				if (key === 'rateLimit.default.max')
					return 2
				return defaultValue
			})

			// Make requests up to limit
			await request(app.getHttpServer()).get('/test/default').expect(200)
			await request(app.getHttpServer()).get('/test/default').expect(200)

			// Next request should be blocked
			await request(app.getHttpServer()).get('/test/default').expect(429)

			// Wait for window to reset
			await new Promise(resolve => setTimeout(resolve, 150))

			// Should be allowed again
			await request(app.getHttpServer()).get('/test/default').expect(200)
		}, 10000)
	})

	describe('request Type Specific Limits', () => {
		it('should apply different limits for image processing requests', async () => {
			// Clear any existing rate limits first
			const rateLimitServicePrivate = rateLimitService as any
			if (rateLimitServicePrivate.requestCounts) {
				rateLimitServicePrivate.requestCounts.clear()
			}

			// Image processing has limit of 5
			for (let i = 0; i < 5; i++) {
				const response = await request(app.getHttpServer())
					.get('/test/image-processing')

				if (response.status !== 200) {
					console.log(`Request ${i + 1} failed with status ${response.status}`)
				}
				expect(response.status).toBe(200)
			}

			// 6th request should be blocked
			const response = await request(app.getHttpServer())
				.get('/test/image-processing')

			expect(response.status).toBe(429)
		})

		it('should track different request types independently', async () => {
			// Clear any existing rate limits first
			const rateLimitServicePrivate = rateLimitService as any
			if (rateLimitServicePrivate.requestCounts) {
				rateLimitServicePrivate.requestCounts.clear()
			}

			// Use up image processing limit
			for (let i = 0; i < 5; i++) {
				await request(app.getHttpServer())
					.get('/test/image-processing')
					.expect(200)
			}

			// Default endpoint should still work (different limit)
			await request(app.getHttpServer())
				.get('/test/default')
				.expect(200)
		})
	})

	describe('health Check Bypass', () => {
		it('should bypass rate limiting for health checks', async () => {
			// First, exhaust the regular rate limit
			for (let i = 0; i < 10; i++) {
				await request(app.getHttpServer())
					.get('/test/default')
					.expect(200)
			}

			// Regular requests should be blocked
			await request(app.getHttpServer())
				.get('/test/default')
				.expect(429)

			// But health checks should still work
			await request(app.getHttpServer())
				.get('/test/health')
				.expect(200)
		})
	})

	describe('iP-based Rate Limiting', () => {
		it('should track different IPs independently', async () => {
			// Make requests from first IP
			for (let i = 0; i < 10; i++) {
				await request(app.getHttpServer())
					.get('/test/default')
					.set('X-Forwarded-For', '192.168.1.1')
					.expect(200)
			}

			// First IP should be blocked
			await request(app.getHttpServer())
				.get('/test/default')
				.set('X-Forwarded-For', '192.168.1.1')
				.expect(429)

			// Second IP should still work
			await request(app.getHttpServer())
				.get('/test/default')
				.set('X-Forwarded-For', '192.168.1.2')
				.expect(200)
		})

		it('should extract IP from various headers', async () => {
			const ipHeaders = [
				{ 'X-Forwarded-For': '192.168.1.1,192.168.1.2' },
				{ 'X-Real-IP': '192.168.1.3' },
			]

			for (const headers of ipHeaders) {
				const response = await request(app.getHttpServer())
					.get('/test/default')
					.set(headers)
					.expect(200)

				expect(response.headers['x-ratelimit-remaining']).toBeDefined()
			}
		})
	})

	describe('rate Limit Headers', () => {
		it('should include proper rate limit headers in response', async () => {
			const response = await request(app.getHttpServer())
				.get('/test/default')
				.expect(200)

			expect(response.headers['x-ratelimit-limit']).toBe('10')
			expect(response.headers['x-ratelimit-remaining']).toBe('9')
			expect(response.headers['x-ratelimit-used']).toBe('1')
			expect(response.headers['x-ratelimit-reset']).toBeDefined()
		})

		it('should update headers correctly with multiple requests', async () => {
			// First request
			let response = await request(app.getHttpServer())
				.get('/test/default')
				.expect(200)

			expect(response.headers['x-ratelimit-remaining']).toBe('9')
			expect(response.headers['x-ratelimit-used']).toBe('1')

			// Second request
			response = await request(app.getHttpServer())
				.get('/test/default')
				.expect(200)

			expect(response.headers['x-ratelimit-remaining']).toBe('8')
			expect(response.headers['x-ratelimit-used']).toBe('2')
		})
	})

	describe('adaptive Rate Limiting', () => {
		it('should reduce limits under high system load', async () => {
			// Mock high system load
			jest.spyOn(rateLimitService, 'getSystemLoad').mockResolvedValue({
				cpuUsage: 90, // High CPU
				memoryUsage: 90, // High memory
				activeConnections: 2000, // High connections
			})

			// The adaptive limit should be lower than the configured limit
			const adaptiveLimit = await rateLimitService.calculateAdaptiveLimit(5)
			expect(adaptiveLimit).toBeLessThan(5)
			expect(adaptiveLimit).toBeGreaterThanOrEqual(1)
		})

		it('should maintain limits under normal system load', async () => {
			// Mock normal system load
			jest.spyOn(rateLimitService, 'getSystemLoad').mockResolvedValue({
				cpuUsage: 50, // Normal CPU
				memoryUsage: 60, // Normal memory
				activeConnections: 100, // Normal connections
			})

			const adaptiveLimit = await rateLimitService.calculateAdaptiveLimit(5)
			expect(adaptiveLimit).toBe(5)
		})
	})

	describe('error Handling', () => {
		it('should handle rate limit service errors gracefully', async () => {
			// Mock an error in the rate limit service
			jest.spyOn(rateLimitService, 'checkRateLimit').mockRejectedValue(new Error('Service error'))

			// Request should still be allowed (fail-open behavior)
			await request(app.getHttpServer())
				.get('/test/default')
				.expect(200)
		})

		it('should handle configuration errors gracefully', async () => {
			// Mock configuration error
			jest.spyOn(configService, 'getOptional').mockImplementation(() => {
				throw new Error('Config error')
			})

			// Request should still be allowed
			await request(app.getHttpServer())
				.get('/test/default')
				.expect(200)
		})
	})

	describe('concurrent Requests', () => {
		it('should handle concurrent requests correctly', async () => {
			const promises = []

			// Make 15 concurrent requests (more than the limit of 10)
			for (let i = 0; i < 15; i++) {
				promises.push(
					request(app.getHttpServer())
						.get('/test/default')
						.set('X-Forwarded-For', '192.168.1.100'),
				)
			}

			const responses = await Promise.all(promises)

			// Some should succeed (200) and some should be rate limited (429)
			const successCount = responses.filter(r => r.status === 200).length
			const rateLimitedCount = responses.filter(r => r.status === 429).length

			console.log(`Success: ${successCount}, Rate limited: ${rateLimitedCount}`)

			expect(successCount).toBeLessThanOrEqual(10)
			expect(rateLimitedCount).toBeGreaterThan(0)
			expect(successCount + rateLimitedCount).toBe(15)
		})
	})
})
