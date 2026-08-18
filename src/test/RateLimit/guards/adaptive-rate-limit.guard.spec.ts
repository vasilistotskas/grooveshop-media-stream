import type { ExecutionContext } from '@nestjs/common'
import type { MockedObject } from 'vitest'
import { Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import { getOptionsToken, getStorageToken, ThrottlerException } from '@nestjs/throttler'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { AdaptiveRateLimitGuard } from '#microservice/RateLimit/guards/adaptive-rate-limit.guard'
import { RateLimitService } from '#microservice/RateLimit/services/rate-limit.service'
import { TenantDomainsService } from '#microservice/Validation/services/tenant-domains.service'

describe('adaptiveRateLimitGuard', () => {
	let guard: AdaptiveRateLimitGuard
	let rateLimitService: MockedObject<RateLimitService>
	let metricsService: MockedObject<MetricsService>
	let tenantDomainsService: MockedObject<TenantDomainsService>

	const mockRequest = {
		url: '/media_stream-image/static/images/test.jpg/100/100/contain/entropy/transparent/5/80.webp',
		method: 'GET',
		headers: {
			'user-agent': 'Mozilla/5.0 (Test Browser)',
			'x-forwarded-for': '192.168.1.1',
		},
		ip: '192.168.1.1',
	}

	const mockResponse = {
		setHeader: vi.fn(),
		// ThrottlerGuard.handleRequest() calls res.header() for X-RateLimit-* headers
		header: vi.fn(),
	}

	const mockExecutionContext = {
		switchToHttp: () => ({
			getRequest: () => mockRequest,
			getResponse: () => mockResponse,
		}),
		// ThrottlerGuard.canActivate() calls these via Reflector to check metadata
		getHandler: () => ({}),
		getClass: () => ({}),
	} as unknown as ExecutionContext

	beforeEach(async () => {
		const mockRateLimitService = {
			generateAdvancedKey: vi.fn(),
			getRateLimitConfig: vi.fn(),
			calculateAdaptiveLimit: vi.fn(),
			checkRateLimit: vi.fn(),
			recordRateLimitMetrics: vi.fn(),
			getWhitelistedDomains: vi.fn(),
			getBypassBotsConfig: vi.fn(),
			isEnabled: vi.fn().mockReturnValue(true),
			getBypassHealthChecksConfig: vi.fn().mockReturnValue(true),
			getBypassStaticAssetsConfig: vi.fn().mockReturnValue(true),
			isBot: vi.fn(),
		}

		const mockMetricsService = {
			recordRateLimitAttempt: vi.fn(),
		}

		const mockTenantDomainsService = {
			isAllowed: vi.fn().mockReturnValue(false),
		}

		// AdaptiveRateLimitGuard extends ThrottlerGuard which requires these tokens.
		// The options must be in the format ThrottlerGuard expects: array of throttler configs
		// with `ttl` (seconds) and `limit`. ThrottlerGuard.onModuleInit() sets this.throttlers.
		const mockThrottlerStorage = {
			increment: vi.fn().mockResolvedValue({ totalHits: 1, timeToExpire: 60000 }),
			getRecord: vi.fn().mockResolvedValue([]),
		}
		const mockThrottlerOptions = [{ ttl: 60, limit: 100, name: 'default' }]

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AdaptiveRateLimitGuard,
				{ provide: RateLimitService, useValue: mockRateLimitService },
				{ provide: MetricsService, useValue: mockMetricsService },
				{ provide: TenantDomainsService, useValue: mockTenantDomainsService },
				{ provide: getOptionsToken(), useValue: mockThrottlerOptions },
				{ provide: getStorageToken(), useValue: mockThrottlerStorage },
				Reflector,
			],
		}).compile()

		// ThrottlerGuard.onModuleInit() sets this.throttlers — must be called before canActivate()
		await module.init()

		guard = module.get<AdaptiveRateLimitGuard>(AdaptiveRateLimitGuard)
		rateLimitService = module.get(RateLimitService)
		metricsService = module.get(MetricsService)
		tenantDomainsService = module.get(TenantDomainsService)
		rateLimitService.getWhitelistedDomains.mockReturnValue([])
		rateLimitService.getBypassBotsConfig.mockReturnValue(true)
		rateLimitService.isBot.mockReturnValue(false)
		tenantDomainsService.isAllowed.mockReturnValue(false)
	})

	afterEach(() => {
		vi.clearAllMocks()
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
			expect(metricsService.recordRateLimitAttempt).toHaveBeenCalledWith('image-processing', true)
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
			expect(metricsService.recordRateLimitAttempt).toHaveBeenCalledWith('image-processing', false)
		})

		it('should skip rate limiting for health check requests', async () => {
			const healthCheckContext = {
				switchToHttp: () => ({
					getRequest: () => ({ ...mockRequest, url: '/health' }),
					getResponse: () => mockResponse,
				}),
				getHandler: () => ({}),
				getClass: () => ({}),
			} as unknown as ExecutionContext

			const result = await guard.canActivate(healthCheckContext)

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
		})

		it('should NOT skip rate limiting for the metrics endpoint (defence-in-depth alongside InternalSecretGuard)', async () => {
			const mockConfig = { windowMs: 60000, max: 100, skipSuccessfulRequests: false, skipFailedRequests: false }
			const mockInfo = { limit: 100, current: 1, remaining: 99, resetTime: new Date() }
			rateLimitService.generateAdvancedKey.mockReturnValue('192.168.1.1:get-default')
			rateLimitService.getRateLimitConfig.mockReturnValue(mockConfig)
			rateLimitService.calculateAdaptiveLimit.mockResolvedValue(100)
			rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true, info: mockInfo })

			const metricsContext = {
				switchToHttp: () => ({
					getRequest: () => ({ ...mockRequest, url: '/metrics' }),
					getResponse: () => mockResponse,
				}),
				getHandler: () => ({}),
				getClass: () => ({}),
			} as unknown as ExecutionContext

			const result = await guard.canActivate(metricsContext)

			expect(result).toBe(true)
			// /metrics is deliberately NOT rate-limit-exempt — the throttle must run
			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
		})

		it('should skip rate limiting for static assets', async () => {
			const staticAssetContext = {
				switchToHttp: () => ({
					getRequest: () => ({ ...mockRequest, url: '/static/image.png' }),
					getResponse: () => mockResponse,
				}),
				getHandler: () => ({}),
				getClass: () => ({}),
			} as unknown as ExecutionContext

			const result = await guard.canActivate(staticAssetContext)

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
		})

		it('should NOT skip rate limiting for image-processing routes ending in a static-asset extension', async () => {
			// Regression: image routes end in `:quality.:format`, so a .png/.jpg/.gif/.svg
			// output format must not match the static-asset bypass and skip the throttle.
			const mockConfig = { windowMs: 60000, max: 50, skipSuccessfulRequests: false, skipFailedRequests: false }
			const mockInfo = { limit: 50, current: 1, remaining: 49, resetTime: new Date() }
			rateLimitService.generateAdvancedKey.mockReturnValue('192.168.1.1:image-processing')
			rateLimitService.getRateLimitConfig.mockReturnValue(mockConfig)
			rateLimitService.calculateAdaptiveLimit.mockResolvedValue(50)
			rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true, info: mockInfo })

			const imagePngContext = {
				switchToHttp: () => ({
					getRequest: () => ({ ...mockRequest, url: '/media_stream-image/static/images/x.jpg/64/64/contain/entropy/transparent/5/80.png' }),
					getResponse: () => mockResponse,
				}),
				getHandler: () => ({}),
				getClass: () => ({}),
			} as unknown as ExecutionContext

			const result = await guard.canActivate(imagePngContext)

			expect(result).toBe(true)
			// The key assertion: the throttle actually ran rather than being bypassed
			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
		})

		it('should skip rate limiting for bot user agents', async () => {
			rateLimitService.getBypassBotsConfig.mockReturnValue(true)
			rateLimitService.isBot.mockReturnValue(true)

			const botContext = {
				switchToHttp: () => ({
					getRequest: () => ({ ...mockRequest, headers: { 'user-agent': 'facebookexternalhit/1.1' } }),
					getResponse: () => mockResponse,
				}),
				getHandler: () => ({}),
				getClass: () => ({}),
			} as unknown as ExecutionContext

			const result = await guard.canActivate(botContext)

			expect(result).toBe(true)
			expect(rateLimitService.isBot).toHaveBeenCalledWith('facebookexternalhit/1.1')
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
		})

		it('should not skip rate limiting when bot bypass is disabled', async () => {
			rateLimitService.getBypassBotsConfig.mockReturnValue(false)
			rateLimitService.isBot.mockReturnValue(true)

			const mockConfig = { windowMs: 60000, max: 100, skipSuccessfulRequests: false, skipFailedRequests: false }
			const mockInfo = { limit: 100, current: 1, remaining: 99, resetTime: new Date() }

			rateLimitService.generateAdvancedKey.mockReturnValue('192.168.1.1:hash:image-processing')
			rateLimitService.getRateLimitConfig.mockReturnValue(mockConfig)
			rateLimitService.calculateAdaptiveLimit.mockResolvedValue(100)
			rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true, info: mockInfo })

			const botContext = {
				switchToHttp: () => ({
					getRequest: () => ({ ...mockRequest, headers: { 'user-agent': 'facebookexternalhit/1.1' } }),
					getResponse: () => mockResponse,
				}),
				getHandler: () => ({}),
				getClass: () => ({}),
			} as unknown as ExecutionContext

			const result = await guard.canActivate(botContext)

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
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

		it('should extract client IP from request.ip, socket, or connection', async () => {
			const testCases = [
				// request.ip takes priority
				{ headers: {}, ip: '192.168.1.5', socket: { remoteAddress: '10.0.0.1' }, expectedIp: '192.168.1.5' },
				// Falls back to socket.remoteAddress when ip is not set
				{ headers: {}, ip: undefined, socket: { remoteAddress: '192.168.1.4' }, expectedIp: '192.168.1.4' },
				// Falls back to connection.remoteAddress
				{ headers: {}, ip: undefined, socket: undefined, connection: { remoteAddress: '192.168.1.6' }, expectedIp: '192.168.1.6' },
				// Falls back to 'unknown' when nothing is available
				{ headers: {}, ip: undefined, socket: undefined, connection: undefined, expectedIp: 'unknown' },
			]

			for (const testCase of testCases) {
				const testRequest = { ...mockRequest, ...testCase }
				const testContext = {
					switchToHttp: () => ({
						getRequest: () => testRequest,
						getResponse: () => mockResponse,
					}),
					getHandler: () => ({}),
					getClass: () => ({}),
				} as unknown as ExecutionContext

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
					// mockRequest uses the shared static-image route, which
					// carries no tenantSchema segment and so resolves to 'public'.
					'public',
				)

				vi.clearAllMocks()
				rateLimitService.getWhitelistedDomains.mockReturnValue([])
				rateLimitService.getBypassBotsConfig.mockReturnValue(true)
				rateLimitService.isBot.mockReturnValue(false)
				tenantDomainsService.isAllowed.mockReturnValue(false)
			}
		})

		it('should key the image-processing bucket by tenant schema extracted from the tenant-scoped media route', async () => {
			const mockConfig = { windowMs: 60000, max: 50, skipSuccessfulRequests: false, skipFailedRequests: false }
			const mockInfo = { limit: 50, current: 1, remaining: 49, resetTime: new Date() }

			rateLimitService.generateAdvancedKey.mockReturnValue('acme:192.168.1.1:image-processing')
			rateLimitService.getRateLimitConfig.mockReturnValue(mockConfig)
			rateLimitService.calculateAdaptiveLimit.mockResolvedValue(50)
			rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true, info: mockInfo })

			const tenantScopedContext = {
				switchToHttp: () => ({
					getRequest: () => ({ ...mockRequest, url: '/media_stream-image/media/acme/uploads/test.jpg/100/100/contain/entropy/transparent/5/80.webp' }),
					getResponse: () => mockResponse,
				}),
				getHandler: () => ({}),
				getClass: () => ({}),
			} as unknown as ExecutionContext

			const result = await guard.canActivate(tenantScopedContext)

			expect(result).toBe(true)
			expect(rateLimitService.generateAdvancedKey).toHaveBeenCalledWith(
				'192.168.1.1',
				expect.any(String),
				'image-processing',
				'acme',
			)
		})

		it('should key different tenants on the same egress IP into different buckets (via distinct generateAdvancedKey calls)', async () => {
			const mockConfig = { windowMs: 60000, max: 50, skipSuccessfulRequests: false, skipFailedRequests: false }
			const mockInfo = { limit: 50, current: 1, remaining: 49, resetTime: new Date() }

			rateLimitService.getRateLimitConfig.mockReturnValue(mockConfig)
			rateLimitService.calculateAdaptiveLimit.mockResolvedValue(50)
			rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true, info: mockInfo })
			rateLimitService.generateAdvancedKey.mockImplementation((ip: string, _ua: string, type: string, tenantSchema?: string) => `${tenantSchema}:${ip}:${type}`)

			const makeContext = (tenant: string) => ({
				switchToHttp: () => ({
					getRequest: () => ({ ...mockRequest, url: `/media_stream-image/media/${tenant}/uploads/test.jpg/100/100/contain/entropy/transparent/5/80.webp` }),
					getResponse: () => mockResponse,
				}),
				getHandler: () => ({}),
				getClass: () => ({}),
			} as unknown as ExecutionContext)

			await guard.canActivate(makeContext('tenant_a'))
			await guard.canActivate(makeContext('tenant_b'))

			expect(rateLimitService.checkRateLimit).toHaveBeenNthCalledWith(1, 'tenant_a:192.168.1.1:image-processing', expect.anything())
			expect(rateLimitService.checkRateLimit).toHaveBeenNthCalledWith(2, 'tenant_b:192.168.1.1:image-processing', expect.anything())
		})

		it('should identify different request types correctly', async () => {
			const testCases = [
				{ url: '/media_stream-image/media/acme/uploads/test.jpg/100/100/contain/entropy/transparent/5/80.webp', expectedType: 'image-processing' },
				{ url: '/media_stream-image/static/images/test.jpg/100/100/contain/entropy/transparent/5/80.webp', expectedType: 'image-processing' },
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
					getHandler: () => ({}),
					getClass: () => ({}),
				} as unknown as ExecutionContext

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

				vi.clearAllMocks()
			}
		})

		describe('domain whitelist bypass (union with dynamic tenant domains)', () => {
			const internalRequestWithReferer = (referer: string) => ({
				switchToHttp: () => ({
					getRequest: () => ({ ...mockRequest, ip: '192.168.1.50', headers: { ...mockRequest.headers, referer } }),
					getResponse: () => mockResponse,
				}),
				getHandler: () => ({}),
				getClass: () => ({}),
			} as unknown as ExecutionContext)

			it('should NOT bypass when the referer domain is neither statically whitelisted nor dynamically known', async () => {
				rateLimitService.getWhitelistedDomains.mockReturnValue([])
				tenantDomainsService.isAllowed.mockReturnValue(false)
				rateLimitService.generateAdvancedKey.mockReturnValue('public:192.168.1.50:image-processing')
				rateLimitService.getRateLimitConfig.mockReturnValue({ windowMs: 60000, max: 50, skipSuccessfulRequests: false, skipFailedRequests: false })
				rateLimitService.calculateAdaptiveLimit.mockResolvedValue(50)
				rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true, info: { limit: 50, current: 1, remaining: 49, resetTime: new Date() } })

				const result = await guard.canActivate(internalRequestWithReferer('https://new-tenant.example.com/page'))

				expect(result).toBe(true)
				expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
			})

			it('should bypass once TenantDomainsService reports the referer domain as allowed — no restart/guard recreation needed', async () => {
				// Static whitelist stays empty/cached the whole test; only the dynamic
				// tenant-domain set "changes" (simulating a background refresh cycle),
				// proving the union check is re-evaluated per-request rather than
				// memoized alongside the static list.
				rateLimitService.getWhitelistedDomains.mockReturnValue([])
				tenantDomainsService.isAllowed.mockReturnValue(false)
				rateLimitService.generateAdvancedKey.mockReturnValue('public:192.168.1.50:image-processing')
				rateLimitService.getRateLimitConfig.mockReturnValue({ windowMs: 60000, max: 50, skipSuccessfulRequests: false, skipFailedRequests: false })
				rateLimitService.calculateAdaptiveLimit.mockResolvedValue(50)
				rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true, info: { limit: 50, current: 1, remaining: 49, resetTime: new Date() } })

				// First call: domain not yet known dynamically -> throttle runs.
				await guard.canActivate(internalRequestWithReferer('https://new-tenant.example.com/page'))
				expect(rateLimitService.checkRateLimit).toHaveBeenCalledTimes(1)

				// Simulate TenantDomainsService picking up the new tenant domain on its
				// next periodic refresh (no new guard instance, no process restart).
				tenantDomainsService.isAllowed.mockImplementation((domain: string) => domain === 'new-tenant.example.com')

				await guard.canActivate(internalRequestWithReferer('https://new-tenant.example.com/page'))

				// Bypass fired this time, so the throttle count did not advance again.
				expect(rateLimitService.checkRateLimit).toHaveBeenCalledTimes(1)
				expect(tenantDomainsService.isAllowed).toHaveBeenCalledWith('new-tenant.example.com')
			})

			it('should not consult the domain whitelist for external (non-internal) IPs even if dynamically allowed', async () => {
				tenantDomainsService.isAllowed.mockReturnValue(true)
				rateLimitService.getWhitelistedDomains.mockReturnValue([])
				rateLimitService.generateAdvancedKey.mockReturnValue('public:203.0.113.9:image-processing')
				rateLimitService.getRateLimitConfig.mockReturnValue({ windowMs: 60000, max: 50, skipSuccessfulRequests: false, skipFailedRequests: false })
				rateLimitService.calculateAdaptiveLimit.mockResolvedValue(50)
				rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true, info: { limit: 50, current: 1, remaining: 49, resetTime: new Date() } })

				const externalContext = {
					switchToHttp: () => ({
						getRequest: () => ({ ...mockRequest, ip: '203.0.113.9', headers: { ...mockRequest.headers, referer: 'https://new-tenant.example.com/page' } }),
						getResponse: () => mockResponse,
					}),
					getHandler: () => ({}),
					getClass: () => ({}),
				} as unknown as ExecutionContext

				const result = await guard.canActivate(externalContext)

				expect(result).toBe(true)
				// External IP -> isDomainWhitelisted() short-circuits before ever
				// consulting TenantDomainsService; the throttle still ran.
				expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
			})
		})
	})
})
