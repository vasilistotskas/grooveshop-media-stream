import { AdaptiveRateLimitGuard } from '@microservice/RateLimit/guards/adaptive-rate-limit.guard'
import { RateLimitMetricsService } from '@microservice/RateLimit/services/rate-limit-metrics.service'
import { RateLimitService } from '@microservice/RateLimit/services/rate-limit.service'
import { ExecutionContext } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { ThrottlerException } from '@nestjs/throttler'

describe('adaptiveRateLimitGuard', () => {
	let guard: AdaptiveRateLimitGuard
	let rateLimitService: jest.Mocked<RateLimitService>
	let rateLimitMetricsService: jest.Mocked<RateLimitMetricsService>

	const mockRequest = {
		url: '/api/v1/image/media/uploads/test.jpg/100/100/contain/entropy/transparent/5/webp/100',
		method: 'GET',
		headers: {
			'user-agent': 'Mozilla/5.0 (Test Browser)',
			'x-forwarded-for': '192.168.1.1',
		},
		ip: '192.168.1.1',
	}

	const mockResponse = {
		setHeader: jest.fn(),
	}

	const mockExecutionContext = {
		switchToHttp: () => ({
			getRequest: () => mockRequest,
			getResponse: () => mockResponse,
		}),
	} as ExecutionContext

	beforeEach(async () => {
		const mockRateLimitService = {
			generateAdvancedKey: jest.fn(),
			getRateLimitConfig: jest.fn(),
			calculateAdaptiveLimit: jest.fn(),
			checkRateLimit: jest.fn(),
			recordRateLimitMetrics: jest.fn(),
		}

		const mockRateLimitMetricsService = {
			recordRateLimitAttempt: jest.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AdaptiveRateLimitGuard,
				{ provide: RateLimitService, useValue: mockRateLimitService },
				{ provide: RateLimitMetricsService, useValue: mockRateLimitMetricsService },
			],
		}).compile()

		guard = module.get<AdaptiveRateLimitGuard>(AdaptiveRateLimitGuard)
		rateLimitService = module.get(RateLimitService)
		rateLimitMetricsService = module.get(RateLimitMetricsService)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe('canActivate', () => {
		it('should allow requests when rate limit is not exceeded', async () => {
			const mockConfig = { windowMs: 60000, max: 100, skipSuccessfulRequests: false, skipFailedRequests: false }
			const mockInfo = { limit: 100, current: 1, remaining: 99, resetTime: new Date() }

			rateLimitService.generateAdvancedKey.mockReturnValue('192.168.1.1:hash:image-processing')
			rateLimitService.getRateLimitConfig.mockReturnValue(mockConfig)
			rateLimitService.calculateAdaptiveLimit.mockResolvedValue(100)
			rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true, info: mockInfo })

			const result = await guard.canActivate(mockExecutionContext)

			expect(result).toBe(true)
			expect(rateLimitService.recordRateLimitMetrics).toHaveBeenCalledWith('image-processing', true, mockInfo)
			expect(rateLimitMetricsService.recordRateLimitAttempt).toHaveBeenCalledWith('image-processing', '192.168.1.1', true)
			expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100')
			expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '99')
		})

		it('should block requests when rate limit is exceeded', async () => {
			const mockConfig = { windowMs: 60000, max: 100, skipSuccessfulRequests: false, skipFailedRequests: false }
			const mockInfo = { limit: 100, current: 101, remaining: 0, resetTime: new Date() }

			rateLimitService.generateAdvancedKey.mockReturnValue('192.168.1.1:hash:image-processing')
			rateLimitService.getRateLimitConfig.mockReturnValue(mockConfig)
			rateLimitService.calculateAdaptiveLimit.mockResolvedValue(100)
			rateLimitService.checkRateLimit.mockResolvedValue({ allowed: false, info: mockInfo })

			await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(ThrottlerException)

			expect(rateLimitService.recordRateLimitMetrics).toHaveBeenCalledWith('image-processing', false, mockInfo)
			expect(rateLimitMetricsService.recordRateLimitAttempt).toHaveBeenCalledWith('image-processing', '192.168.1.1', false)
		})

		it('should skip rate limiting for health check requests', async () => {
			const healthCheckContext = {
				switchToHttp: () => ({
					getRequest: () => ({ ...mockRequest, url: '/health' }),
					getResponse: () => mockResponse,
				}),
			} as ExecutionContext

			const result = await guard.canActivate(healthCheckContext)

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
		})

		it('should skip rate limiting for metrics endpoint', async () => {
			const metricsContext = {
				switchToHttp: () => ({
					getRequest: () => ({ ...mockRequest, url: '/metrics' }),
					getResponse: () => mockResponse,
				}),
			} as ExecutionContext

			const result = await guard.canActivate(metricsContext)

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
		})

		it('should skip rate limiting for static assets', async () => {
			const staticAssetContext = {
				switchToHttp: () => ({
					getRequest: () => ({ ...mockRequest, url: '/static/image.png' }),
					getResponse: () => mockResponse,
				}),
			} as ExecutionContext

			const result = await guard.canActivate(staticAssetContext)

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
		})

		it('should apply adaptive rate limiting', async () => {
			const mockConfig = { windowMs: 60000, max: 100, skipSuccessfulRequests: false, skipFailedRequests: false }
			const mockInfo = { limit: 50, current: 1, remaining: 49, resetTime: new Date() }

			rateLimitService.generateAdvancedKey.mockReturnValue('192.168.1.1:hash:image-processing')
			rateLimitService.getRateLimitConfig.mockReturnValue(mockConfig)
			rateLimitService.calculateAdaptiveLimit.mockResolvedValue(50) // Reduced due to system load
			rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true, info: mockInfo })

			const result = await guard.canActivate(mockExecutionContext)

			expect(result).toBe(true)
			expect(rateLimitService.calculateAdaptiveLimit).toHaveBeenCalledWith(100)
			expect(rateLimitService.checkRateLimit).toHaveBeenCalledWith(
				'192.168.1.1:hash:image-processing',
				{ ...mockConfig, max: 50 },
			)
		})

		it('should handle errors gracefully and allow requests', async () => {
			rateLimitService.generateAdvancedKey.mockImplementation(() => {
				throw new Error('Test error')
			})

			const result = await guard.canActivate(mockExecutionContext)

			expect(result).toBe(true) // Should allow request on error
		})

		it('should extract client IP from various headers', async () => {
			const testCases = [
				{ headers: { 'x-forwarded-for': '192.168.1.1,192.168.1.2' }, expectedIp: '192.168.1.1' },
				{ headers: { 'x-real-ip': '192.168.1.3' }, expectedIp: '192.168.1.3' },
				{ headers: {}, connection: { remoteAddress: '192.168.1.4' }, expectedIp: '192.168.1.4' },
				{ headers: {}, ip: '192.168.1.5', expectedIp: '192.168.1.5' },
			]

			for (const testCase of testCases) {
				const testRequest = { ...mockRequest, ...testCase }
				const testContext = {
					switchToHttp: () => ({
						getRequest: () => testRequest,
						getResponse: () => mockResponse,
					}),
				} as ExecutionContext

				const mockConfig = { windowMs: 60000, max: 100, skipSuccessfulRequests: false, skipFailedRequests: false }
				const mockInfo = { limit: 100, current: 1, remaining: 99, resetTime: new Date() }

				rateLimitService.generateAdvancedKey.mockReturnValue(`${testCase.expectedIp}:hash:image-processing`)
				rateLimitService.getRateLimitConfig.mockReturnValue(mockConfig)
				rateLimitService.calculateAdaptiveLimit.mockResolvedValue(100)
				rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true, info: mockInfo })

				await guard.canActivate(testContext)

				expect(rateLimitService.generateAdvancedKey).toHaveBeenCalledWith(
					testCase.expectedIp,
					expect.any(String),
					'image-processing',
				)

				jest.clearAllMocks()
			}
		})

		it('should identify different request types correctly', async () => {
			const testCases = [
				{ url: '/api/v1/image/media/uploads/test.jpg/100/100/contain/entropy/transparent/5/webp/100', expectedType: 'image-processing' },
				{ url: '/api/v1/image/static/images/test.jpg/100/100/contain/entropy/transparent/5/webp/100', expectedType: 'image-processing' },
				{ url: '/health', expectedType: 'health-check' },
				{ url: '/api/v1/other', expectedType: 'get-default' },
			]

			for (const testCase of testCases) {
				const testRequest = { ...mockRequest, url: testCase.url }
				const testContext = {
					switchToHttp: () => ({
						getRequest: () => testRequest,
						getResponse: () => mockResponse,
					}),
				} as ExecutionContext

				// Skip health checks as they bypass rate limiting
				if (testCase.expectedType === 'health-check') {
					continue
				}

				const mockConfig = { windowMs: 60000, max: 100, skipSuccessfulRequests: false, skipFailedRequests: false }
				const mockInfo = { limit: 100, current: 1, remaining: 99, resetTime: new Date() }

				rateLimitService.generateAdvancedKey.mockReturnValue(`192.168.1.1:hash:${testCase.expectedType}`)
				rateLimitService.getRateLimitConfig.mockReturnValue(mockConfig)
				rateLimitService.calculateAdaptiveLimit.mockResolvedValue(100)
				rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true, info: mockInfo })

				await guard.canActivate(testContext)

				expect(rateLimitService.getRateLimitConfig).toHaveBeenCalledWith(testCase.expectedType)

				jest.clearAllMocks()
			}
		})
	})
})
