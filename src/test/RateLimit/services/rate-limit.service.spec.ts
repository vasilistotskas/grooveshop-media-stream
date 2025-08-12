import { ConfigService } from '@microservice/Config/config.service'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { RateLimitService } from '@microservice/RateLimit/services/rate-limit.service'
import { Test, TestingModule } from '@nestjs/testing'

describe('rateLimitService', () => {
	let service: RateLimitService
	let configService: jest.Mocked<ConfigService>
	let metricsService: jest.Mocked<MetricsService>

	beforeEach(async () => {
		const mockConfigService = {
			get: jest.fn(),
			getOptional: jest.fn(),
		}

		const mockMetricsService = {
			recordCacheOperation: jest.fn(),
			recordError: jest.fn(),
			getRegistry: jest.fn().mockReturnValue({}),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RateLimitService,
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: MetricsService, useValue: mockMetricsService },
			],
		}).compile()

		service = module.get<RateLimitService>(RateLimitService)
		configService = module.get(ConfigService)
		metricsService = module.get(MetricsService)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe('generateKey', () => {
		it('should generate a key from IP and request type', () => {
			const key = service.generateKey('192.168.1.1', 'image-processing')
			expect(key).toBe('192.168.1.1:image-processing')
		})
	})

	describe('generateAdvancedKey', () => {
		it('should generate an advanced key with user agent hash', () => {
			const key = service.generateAdvancedKey('192.168.1.1', 'Mozilla/5.0', 'image-processing')
			expect(key).toMatch(/^192\.168\.1\.1:[a-z0-9]+:image-processing$/)
		})

		it('should handle empty user agent', () => {
			const key = service.generateAdvancedKey('192.168.1.1', '', 'image-processing')
			expect(key).toMatch(/^192\.168\.1\.1:[a-z0-9]+:image-processing$/)
		})
	})

	describe('getRateLimitConfig', () => {
		beforeEach(() => {
			configService.getOptional.mockImplementation((key: string, defaultValue?: any) => {
				const configs = {
					'rateLimit.default.windowMs': 60000,
					'rateLimit.default.max': 100,
					'rateLimit.imageProcessing.windowMs': 60000,
					'rateLimit.imageProcessing.max': 50,
					'rateLimit.healthCheck.windowMs': 10000,
					'rateLimit.healthCheck.max': 1000,
				}
				return configs[key] || defaultValue
			})
		})

		it('should return default config for unknown request type', () => {
			const config = service.getRateLimitConfig('unknown')
			expect(config).toEqual({
				windowMs: 60000,
				max: 100,
				skipSuccessfulRequests: false,
				skipFailedRequests: false,
			})
		})

		it('should return image processing config', () => {
			const config = service.getRateLimitConfig('image-processing')
			expect(config).toEqual({
				windowMs: 60000,
				max: 50,
				skipSuccessfulRequests: false,
				skipFailedRequests: false,
			})
		})

		it('should return health check config', () => {
			const config = service.getRateLimitConfig('health-check')
			expect(config).toEqual({
				windowMs: 10000,
				max: 1000,
				skipSuccessfulRequests: false,
				skipFailedRequests: false,
			})
		})
	})

	describe('checkRateLimit', () => {
		const mockConfig = {
			windowMs: 60000,
			max: 5,
			skipSuccessfulRequests: false,
			skipFailedRequests: false,
		}

		it('should allow first request', async () => {
			const result = await service.checkRateLimit('test-key', mockConfig)

			expect(result.allowed).toBe(true)
			expect(result.info.current).toBe(1)
			expect(result.info.remaining).toBe(4)
			expect(result.info.limit).toBe(5)
		})

		it('should track multiple requests', async () => {
			// First request
			await service.checkRateLimit('test-key', mockConfig)

			// Second request
			const result = await service.checkRateLimit('test-key', mockConfig)

			expect(result.allowed).toBe(true)
			expect(result.info.current).toBe(2)
			expect(result.info.remaining).toBe(3)
		})

		it('should block requests when limit exceeded', async () => {
			// Make 5 requests (at the limit)
			for (let i = 0; i < 5; i++) {
				await service.checkRateLimit('test-key', mockConfig)
			}

			// 6th request should be blocked
			const result = await service.checkRateLimit('test-key', mockConfig)

			expect(result.allowed).toBe(false)
			expect(result.info.current).toBe(6)
			expect(result.info.remaining).toBe(0)
		})

		it('should reset after window expires', async () => {
			const shortConfig = { ...mockConfig, windowMs: 100 }

			// Make request
			await service.checkRateLimit('test-key', shortConfig)

			// Wait for window to expire
			await new Promise(resolve => setTimeout(resolve, 150))

			// Next request should be allowed
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

	describe('getSystemLoad', () => {
		it('should return system load information', async () => {
			const systemLoad = await service.getSystemLoad()

			expect(systemLoad).toHaveProperty('cpuUsage')
			expect(systemLoad).toHaveProperty('memoryUsage')
			expect(systemLoad).toHaveProperty('activeConnections')
			expect(typeof systemLoad.memoryUsage).toBe('number')
		})
	})

	describe('calculateAdaptiveLimit', () => {
		it('should return base limit when system load is low', async () => {
			// Temporarily override NODE_ENV to test adaptive behavior
			const originalEnv = process.env.NODE_ENV
			process.env.NODE_ENV = 'production'

			try {
				// Mock low system load
				jest.spyOn(service, 'getSystemLoad').mockResolvedValue({
					cpuUsage: 50,
					memoryUsage: 60,
					activeConnections: 100,
				})

				const adaptiveLimit = await service.calculateAdaptiveLimit(100)
				expect(adaptiveLimit).toBe(100)
			}
			finally {
				// Restore original environment
				process.env.NODE_ENV = originalEnv
			}
		})

		it('should reduce limit when memory usage is high', async () => {
			// Temporarily override NODE_ENV to test adaptive behavior
			const originalEnv = process.env.NODE_ENV
			process.env.NODE_ENV = 'production'

			try {
				// Mock high memory usage
				jest.spyOn(service, 'getSystemLoad').mockResolvedValue({
					cpuUsage: 50,
					memoryUsage: 90, // Above 85% threshold
					activeConnections: 100,
				})

				const adaptiveLimit = await service.calculateAdaptiveLimit(100)
				expect(adaptiveLimit).toBeLessThan(100)
				expect(adaptiveLimit).toBeGreaterThan(0)
			}
			finally {
				// Restore original environment
				process.env.NODE_ENV = originalEnv
			}
		})

		it('should ensure minimum limit of 1', async () => {
			// Temporarily override NODE_ENV to test adaptive behavior
			const originalEnv = process.env.NODE_ENV
			process.env.NODE_ENV = 'production'

			try {
				// Mock extremely high system load
				jest.spyOn(service, 'getSystemLoad').mockResolvedValue({
					cpuUsage: 95,
					memoryUsage: 95,
					activeConnections: 2000,
				})

				const adaptiveLimit = await service.calculateAdaptiveLimit(10)
				expect(adaptiveLimit).toBeGreaterThanOrEqual(1)
			}
			finally {
				// Restore original environment
				process.env.NODE_ENV = originalEnv
			}
		})
	})

	describe('recordRateLimitMetrics', () => {
		it('should record metrics for allowed requests', () => {
			const info = {
				limit: 100,
				current: 1,
				remaining: 99,
				resetTime: new Date(),
			}

			service.recordRateLimitMetrics('image-processing', true, info)

			expect(metricsService.recordError).not.toHaveBeenCalled()
		})

		it('should record metrics for blocked requests', () => {
			const info = {
				limit: 100,
				current: 101,
				remaining: 0,
				resetTime: new Date(),
			}

			service.recordRateLimitMetrics('image-processing', false, info)

			expect(metricsService.recordError).toHaveBeenCalledWith(
				'rate_limit_exceeded',
				'image-processing',
			)
		})
	})

	describe('resetRateLimit', () => {
		it('should reset rate limit for specific key', async () => {
			const mockConfig = {
				windowMs: 60000,
				max: 1,
				skipSuccessfulRequests: false,
				skipFailedRequests: false,
			}

			// Make request to reach limit
			await service.checkRateLimit('test-key', mockConfig)

			// Reset the key
			service.resetRateLimit('test-key')

			// Next request should be allowed
			const result = await service.checkRateLimit('test-key', mockConfig)
			expect(result.allowed).toBe(true)
			expect(result.info.current).toBe(1)
		})
	})
})
