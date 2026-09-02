import type { ExecutionContext } from '@nestjs/common'
import type { MetricsService } from '#microservice/Metrics/services/metrics.service'
import type { RateLimitInfo, RateLimitService } from '#microservice/RateLimit/services/rate-limit.service'
import type { TenantDomainsService } from '#microservice/Validation/services/tenant-domains.service'
import type { ConfigOverrides } from '../../helpers/config-service.mock.js'
import { HttpException, HttpStatus } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdaptiveRateLimitGuard } from '#microservice/RateLimit/guards/adaptive-rate-limit.guard'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

const STATIC_IMAGE_URL = '/media_stream-image/static/images/test.jpg/100/100/contain/entropy/transparent/5/80.webp'
const TENANT_IMAGE_URL = (tenant: string) => `/media_stream-image/media/${tenant}/uploads/test.jpg/100/100/contain/entropy/transparent/5/80.webp`
const INTERNAL_IP = '192.168.1.1'
const EXTERNAL_IP = '203.0.113.9'
const BROWSER_UA = 'Mozilla/5.0 (Test Browser)'
const BOT_UA = 'facebookexternalhit/1.1'

function createRateLimitServiceMock() {
	return {
		generateAdvancedKey: vi.fn<RateLimitService['generateAdvancedKey']>(),
		getRateLimitConfig: vi.fn<RateLimitService['getRateLimitConfig']>(),
		calculateAdaptiveLimit: vi.fn<RateLimitService['calculateAdaptiveLimit']>(),
		checkRateLimit: vi.fn<RateLimitService['checkRateLimit']>(),
		recordRateLimitMetrics: vi.fn<RateLimitService['recordRateLimitMetrics']>(),
		isBot: vi.fn<RateLimitService['isBot']>().mockReturnValue(false),
	}
}

describe('adaptiveRateLimitGuard', () => {
	let guard: AdaptiveRateLimitGuard
	let rateLimitService: ReturnType<typeof createRateLimitServiceMock>
	let metricsService: { recordRateLimitAttempt: ReturnType<typeof vi.fn> }
	let tenantDomainsService: { isAllowed: ReturnType<typeof vi.fn<TenantDomainsService['isAllowed']>> }
	let response: { setHeader: ReturnType<typeof vi.fn> }

	const baseRequest = {
		url: STATIC_IMAGE_URL,
		method: 'GET',
		headers: { 'user-agent': BROWSER_UA } as Record<string, string | undefined>,
		ip: INTERNAL_IP,
	}

	function createGuard(overrides: ConfigOverrides = {}): AdaptiveRateLimitGuard {
		return new AdaptiveRateLimitGuard(
			createConfigServiceMock(overrides),
			rateLimitService as unknown as RateLimitService,
			metricsService as unknown as MetricsService,
			tenantDomainsService as unknown as TenantDomainsService,
		)
	}

	function createContext(request: Record<string, unknown> = {}): ExecutionContext {
		return {
			switchToHttp: () => ({
				getRequest: () => ({ ...baseRequest, ...request }),
				getResponse: () => response,
			}),
		} as unknown as ExecutionContext
	}

	/** Drive the limiter collaborators to a deterministic decision. */
	function primeRateLimit(options: { max?: number, current?: number, allowed?: boolean, resetTime?: Date } = {}) {
		const { max = 100, current = 1, allowed = true, resetTime = new Date(Date.now() + 60_000) } = options
		const config = { windowMs: 60_000, max }
		const info: RateLimitInfo = { limit: max, current, remaining: Math.max(0, max - current), resetTime }

		rateLimitService.generateAdvancedKey.mockReturnValue('rate-limit-key')
		rateLimitService.getRateLimitConfig.mockReturnValue(config)
		rateLimitService.calculateAdaptiveLimit.mockResolvedValue(max)
		rateLimitService.checkRateLimit.mockResolvedValue({ allowed, info })

		return { config, info }
	}

	async function expectTooManyRequests(promise: Promise<boolean>): Promise<void> {
		const error = await promise.then(
			() => {
				throw new Error('expected canActivate to reject')
			},
			(caught: unknown) => caught,
		)
		expect(error).toBeInstanceOf(HttpException)
		expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
	}

	beforeEach(() => {
		rateLimitService = createRateLimitServiceMock()
		metricsService = { recordRateLimitAttempt: vi.fn() }
		tenantDomainsService = { isAllowed: vi.fn<TenantDomainsService['isAllowed']>().mockReturnValue(false) }
		response = { setHeader: vi.fn() }
		guard = createGuard()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe('kill-switch', () => {
		it('should allow every request without consulting the limiter when rateLimit.enabled is false', async () => {
			guard = createGuard({ 'rateLimit.enabled': false })

			const result = await guard.canActivate(createContext())

			expect(result).toBe(true)
			expect(rateLimitService.isBot).not.toHaveBeenCalled()
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
			expect(response.setHeader).not.toHaveBeenCalled()
		})
	})

	describe('counted requests', () => {
		it('should allow requests under the limit and expose the X-RateLimit-* headers', async () => {
			const resetTime = new Date('2026-01-01T00:01:00.000Z')
			const { info } = primeRateLimit({ max: 100, current: 1, resetTime })

			const result = await guard.canActivate(createContext())

			expect(result).toBe(true)
			expect(rateLimitService.recordRateLimitMetrics).toHaveBeenCalledWith('image-processing', true, info)
			expect(metricsService.recordRateLimitAttempt).toHaveBeenCalledWith('image-processing', true)
			expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100')
			expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '99')
			expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Used', '1')
			expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', String(Math.ceil(resetTime.getTime() / 1000)))
			expect(response.setHeader).not.toHaveBeenCalledWith('Retry-After', expect.anything())
		})

		it('should throw 429 with a Retry-After header when the limit is exceeded', async () => {
			vi.useFakeTimers({ toFake: ['Date'] })
			vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
			const resetTime = new Date('2026-01-01T00:00:30.000Z')
			const { info } = primeRateLimit({ max: 100, current: 101, allowed: false, resetTime })

			await expectTooManyRequests(guard.canActivate(createContext()))

			expect(rateLimitService.recordRateLimitMetrics).toHaveBeenCalledWith('image-processing', false, info)
			expect(metricsService.recordRateLimitAttempt).toHaveBeenCalledWith('image-processing', false)
			expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0')
			expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Used', '101')
			expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '30')
		})

		it('should check the counter against the adaptive limit, not the configured one', async () => {
			const { config } = primeRateLimit({ max: 100 })
			rateLimitService.calculateAdaptiveLimit.mockResolvedValue(50)

			await guard.canActivate(createContext())

			expect(rateLimitService.calculateAdaptiveLimit).toHaveBeenCalledWith(100)
			expect(rateLimitService.checkRateLimit).toHaveBeenCalledWith('rate-limit-key', { ...config, max: 50 })
		})

		it('should NOT exempt the metrics endpoint (defence-in-depth alongside InternalSecretGuard)', async () => {
			primeRateLimit()

			const result = await guard.canActivate(createContext({ url: '/metrics' }))

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
		})
	})

	describe('fail-open', () => {
		it('should allow the request when key generation throws', async () => {
			rateLimitService.generateAdvancedKey.mockImplementation(() => {
				throw new Error('Test error')
			})

			await expect(guard.canActivate(createContext())).resolves.toBe(true)
		})

		it('should allow the request without headers when the counter lookup rejects', async () => {
			primeRateLimit()
			rateLimitService.checkRateLimit.mockRejectedValue(new Error('Redis down'))

			await expect(guard.canActivate(createContext())).resolves.toBe(true)
			expect(response.setHeader).not.toHaveBeenCalled()
			expect(metricsService.recordRateLimitAttempt).not.toHaveBeenCalled()
		})
	})

	describe('health-check bypass', () => {
		it.each(['/health', '/health/live', '/health/ready', '/health/circuit-breaker/reset'])('should skip %s probes', async (url) => {
			const result = await guard.canActivate(createContext({ url }))

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
		})

		it('should still limit POST /health/circuit-breaker/reset as the health-check bucket', async () => {
			primeRateLimit()

			await guard.canActivate(createContext({ url: '/health/circuit-breaker/reset', method: 'POST' }))

			expect(rateLimitService.getRateLimitConfig).toHaveBeenCalledWith('health-check')
			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
		})

		it('should limit health probes when rateLimit.bypass.healthChecks is false', async () => {
			guard = createGuard({ 'rateLimit.bypass.healthChecks': false })
			primeRateLimit()

			await guard.canActivate(createContext({ url: '/health' }))

			expect(rateLimitService.getRateLimitConfig).toHaveBeenCalledWith('health-check')
			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
		})
	})

	describe('static-asset bypass', () => {
		it.each(['/static/image.png', '/favicon.ico', '/assets/app.js'])('should skip %s', async (url) => {
			const result = await guard.canActivate(createContext({ url }))

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
		})

		it('should NOT skip image-processing routes ending in a static-asset extension', async () => {
			// Regression: image routes end in `:quality.:format`, so a .png/.jpg/.gif/.svg
			// output format must not match the static-asset bypass and skip the throttle.
			primeRateLimit({ max: 50 })

			const result = await guard.canActivate(createContext({
				url: '/media_stream-image/static/images/x.jpg/64/64/contain/entropy/transparent/5/80.png',
			}))

			expect(result).toBe(true)
			expect(rateLimitService.getRateLimitConfig).toHaveBeenCalledWith('image-processing')
			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
		})

		it('should limit static assets when rateLimit.bypass.staticAssets is false', async () => {
			guard = createGuard({ 'rateLimit.bypass.staticAssets': false })
			primeRateLimit()

			await guard.canActivate(createContext({ url: '/static/image.png' }))

			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
		})
	})

	describe('bot bypass', () => {
		it('should skip bots calling from an internal IP', async () => {
			rateLimitService.isBot.mockReturnValue(true)

			const result = await guard.canActivate(createContext({ ip: INTERNAL_IP, headers: { 'user-agent': BOT_UA } }))

			expect(result).toBe(true)
			expect(rateLimitService.isBot).toHaveBeenCalledWith(BOT_UA)
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
		})

		it('should NOT skip bots calling from an external IP (spoofed bot UAs cannot bypass)', async () => {
			rateLimitService.isBot.mockReturnValue(true)
			primeRateLimit()

			const result = await guard.canActivate(createContext({ ip: EXTERNAL_IP, headers: { 'user-agent': BOT_UA } }))

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
		})

		it('should NOT skip bots when rateLimit.bypass.bots is false', async () => {
			guard = createGuard({ 'rateLimit.bypass.bots': false })
			rateLimitService.isBot.mockReturnValue(true)
			primeRateLimit()

			const result = await guard.canActivate(createContext({ ip: INTERNAL_IP, headers: { 'user-agent': BOT_UA } }))

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
		})
	})

	describe('domain whitelist bypass (static list unioned with dynamic tenant domains)', () => {
		const internalRequestWith = (headers: Record<string, string>) =>
			createContext({ ip: '192.168.1.50', headers: { 'user-agent': BROWSER_UA, ...headers } })

		it('should skip internal requests whose referer matches the static whitelist exactly', async () => {
			guard = createGuard({ 'rateLimit.bypass.whitelistedDomains': ['webside.gr'] })

			const result = await guard.canActivate(internalRequestWith({ referer: 'https://webside.gr/page' }))

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
		})

		it.each(['https://assets.webside.gr/img.png', 'https://webside.gr/'])('should match a `*.` wildcard entry against %s', async (referer) => {
			guard = createGuard({ 'rateLimit.bypass.whitelistedDomains': ['*.webside.gr'] })

			const result = await guard.canActivate(internalRequestWith({ referer }))

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
		})

		it('should also honour the Origin header', async () => {
			guard = createGuard({ 'rateLimit.bypass.whitelistedDomains': ['webside.gr'] })

			const result = await guard.canActivate(internalRequestWith({ origin: 'https://webside.gr' }))

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled()
		})

		it('should NOT skip when the referer domain is neither statically whitelisted nor dynamically known', async () => {
			guard = createGuard({ 'rateLimit.bypass.whitelistedDomains': ['webside.gr'] })
			primeRateLimit({ max: 50 })

			const result = await guard.canActivate(internalRequestWith({ referer: 'https://new-tenant.example.com/page' }))

			expect(result).toBe(true)
			expect(tenantDomainsService.isAllowed).toHaveBeenCalledWith('new-tenant.example.com')
			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
		})

		it('should ignore a malformed referer and count the request', async () => {
			guard = createGuard({ 'rateLimit.bypass.whitelistedDomains': ['webside.gr'] })
			primeRateLimit()

			const result = await guard.canActivate(internalRequestWith({ referer: 'not a url' }))

			expect(result).toBe(true)
			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
		})

		it('should skip once TenantDomainsService reports the referer domain as allowed, without a new guard instance', async () => {
			// The static whitelist stays empty for the whole test; only the dynamic
			// tenant-domain set "changes" (simulating a background refresh cycle),
			// proving the union check is re-evaluated per request rather than
			// memoized alongside the static list.
			primeRateLimit({ max: 50 })
			const context = internalRequestWith({ referer: 'https://new-tenant.example.com/page' })

			await guard.canActivate(context)
			expect(rateLimitService.checkRateLimit).toHaveBeenCalledTimes(1)

			tenantDomainsService.isAllowed.mockImplementation(domain => domain === 'new-tenant.example.com')

			await guard.canActivate(context)

			expect(rateLimitService.checkRateLimit).toHaveBeenCalledTimes(1)
			expect(tenantDomainsService.isAllowed).toHaveBeenCalledWith('new-tenant.example.com')
		})

		it('should not consult the whitelist at all for external IPs, even when the domain is allowed', async () => {
			guard = createGuard({ 'rateLimit.bypass.whitelistedDomains': ['webside.gr'] })
			tenantDomainsService.isAllowed.mockReturnValue(true)
			primeRateLimit({ max: 50 })

			const result = await guard.canActivate(createContext({
				ip: EXTERNAL_IP,
				headers: { 'user-agent': BROWSER_UA, 'referer': 'https://webside.gr/page' },
			}))

			expect(result).toBe(true)
			expect(tenantDomainsService.isAllowed).not.toHaveBeenCalled()
			expect(rateLimitService.checkRateLimit).toHaveBeenCalled()
		})
	})

	describe('request identity', () => {
		it.each([
			// request.ip takes priority
			{ ip: '192.168.1.5', socket: { remoteAddress: '10.0.0.1' }, expectedIp: '192.168.1.5' },
			// Falls back to socket.remoteAddress when ip is not set
			{ ip: undefined, socket: { remoteAddress: '192.168.1.4' }, expectedIp: '192.168.1.4' },
			// Falls back to connection.remoteAddress
			{ ip: undefined, socket: undefined, connection: { remoteAddress: '192.168.1.6' }, expectedIp: '192.168.1.6' },
			// Falls back to 'unknown' when nothing is available
			{ ip: undefined, socket: undefined, connection: undefined, expectedIp: 'unknown' },
		])('should resolve the client IP to $expectedIp and normalise a missing user agent to an empty string', async ({ expectedIp, ...request }) => {
			primeRateLimit()

			await guard.canActivate(createContext({ ...request, headers: {} }))

			// The shared static-image route carries no tenantSchema segment and so
			// resolves to 'public'.
			expect(rateLimitService.generateAdvancedKey).toHaveBeenCalledWith(expectedIp, '', 'image-processing', 'public')
		})

		it('should key the image-processing bucket by the tenant schema of the tenant-scoped media route', async () => {
			primeRateLimit({ max: 50 })

			await guard.canActivate(createContext({ url: TENANT_IMAGE_URL('acme') }))

			expect(rateLimitService.generateAdvancedKey).toHaveBeenCalledWith(INTERNAL_IP, BROWSER_UA, 'image-processing', 'acme')
		})

		it('should key different tenants on the same egress IP into different buckets', async () => {
			primeRateLimit({ max: 50 })
			rateLimitService.generateAdvancedKey.mockImplementation((ip, _ua, type, tenantSchema) => `${tenantSchema}:${ip}:${type}`)

			await guard.canActivate(createContext({ url: TENANT_IMAGE_URL('tenant_a') }))
			await guard.canActivate(createContext({ url: TENANT_IMAGE_URL('tenant_b') }))

			expect(rateLimitService.checkRateLimit).toHaveBeenNthCalledWith(1, `tenant_a:${INTERNAL_IP}:image-processing`, expect.anything())
			expect(rateLimitService.checkRateLimit).toHaveBeenNthCalledWith(2, `tenant_b:${INTERNAL_IP}:image-processing`, expect.anything())
		})

		it.each([
			{ url: TENANT_IMAGE_URL('acme'), method: 'GET', expectedType: 'image-processing', expectedTenant: 'acme' },
			{ url: STATIC_IMAGE_URL, method: 'GET', expectedType: 'image-processing', expectedTenant: 'public' },
			{ url: '/api/v1/other', method: 'GET', expectedType: 'get-default', expectedTenant: 'public' },
			{ url: '/api/v1/other', method: 'POST', expectedType: 'post-default', expectedTenant: 'public' },
		])('should classify $method $url as $expectedType', async ({ url, method, expectedType, expectedTenant }) => {
			primeRateLimit()

			await guard.canActivate(createContext({ url, method }))

			expect(rateLimitService.generateAdvancedKey).toHaveBeenCalledWith(INTERNAL_IP, BROWSER_UA, expectedType, expectedTenant)
			expect(rateLimitService.getRateLimitConfig).toHaveBeenCalledWith(expectedType)
		})
	})
})
