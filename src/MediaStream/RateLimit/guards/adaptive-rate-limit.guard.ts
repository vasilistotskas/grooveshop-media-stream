import type { ExecutionContext } from '@nestjs/common'
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler'
import * as process from 'node:process'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { getOptionsToken, getStorageToken, ThrottlerException, ThrottlerGuard } from '@nestjs/throttler'
import { RateLimitService } from '../services/rate-limit.service.js'

const STATIC_ASSET_RE = /\.(?:css|js|png|jpg|jpeg|gif|ico|svg)$/

/**
 * AdaptiveRateLimitGuard extends ThrottlerGuard so that the NestJS Throttler
 * storage (registered via ThrottlerModule.forRootAsync) is the counting backend.
 *
 * Layer structure:
 *   1. shouldSkip() — fast-path bypass for dev, health/metrics, bots from
 *      internal IPs, and whitelisted domains.  If any bypass fires, the
 *      NestJS ThrottlerGuard counting is skipped entirely.
 *   2. Adaptive pre-check — when system load is high the effective limit is
 *      reduced; if that reduced limit is already exceeded by our own Redis
 *      counter we throw 429 immediately without going through the Throttler
 *      increment path.
 *   3. super.canActivate() — delegates to ThrottlerGuard which calls
 *      storageService.increment() (in-memory ThrottlerStorageService) for
 *      the per-process secondary safety net, and sets X-RateLimit-* headers.
 *
 * The primary distributed counter lives in RateLimitService (Redis via
 * ioredis with an atomic Lua INCR+EXPIRE).  The ThrottlerStorageService is
 * an in-process fallback that catches per-pod bursts even if Redis is down.
 *
 * Testability: Because shouldSkip() and getTracker() are both overridable
 * protected methods, unit tests can subclass this guard and replace either
 * without mocking the entire ThrottlerModule.  Integration tests can inject
 * a spy ThrottlerStorage to assert increment() call counts.
 */
@Injectable()
export class AdaptiveRateLimitGuard extends ThrottlerGuard {
	private readonly _logger = new Logger(AdaptiveRateLimitGuard.name)
	private cachedWhitelistedDomains: string[] | null = null
	private cachedBypassBots: boolean | null = null

	constructor(
		@Inject(getOptionsToken()) options: ThrottlerModuleOptions,
		@Inject(getStorageToken()) storageService: ThrottlerStorage,
		reflector: Reflector,
		private readonly rateLimitService: RateLimitService,
		private readonly metricsService: MetricsService,
	) {
		super(options, storageService, reflector)
	}

	/**
	 * Override canActivate to add adaptive pre-check before delegating to the
	 * NestJS ThrottlerGuard counting.
	 */
	override async canActivate(context: ExecutionContext): Promise<boolean> {
		if (process.env.NODE_ENV === 'development') {
			this._logger.debug('Skipping rate limiting in development mode')
			return true
		}

		const request = context.switchToHttp().getRequest()

		if (await this.shouldSkip(context)) {
			return true
		}

		// Adaptive pre-check: apply Redis-backed counting with load-adjusted
		// limits BEFORE the ThrottlerGuard in-memory increment.
		try {
			const clientIp = this.getClientIp(request)
			const requestType = this.getRequestType(request)
			const userAgent: string = request.headers['user-agent'] || ''

			const rateLimitKey = this.rateLimitService.generateAdvancedKey(clientIp, userAgent, requestType)
			const config = this.rateLimitService.getRateLimitConfig(requestType)
			const adaptiveLimit = await this.rateLimitService.calculateAdaptiveLimit(config.max)
			const adaptiveConfig = { ...config, max: adaptiveLimit }

			const { allowed, info } = await this.rateLimitService.checkRateLimit(rateLimitKey, adaptiveConfig)

			this.rateLimitService.recordRateLimitMetrics(requestType, allowed, info)
			this.metricsService.recordRateLimitAttempt(requestType, allowed)

			const response = context.switchToHttp().getResponse()
			this.addRateLimitHeaders(response, info, allowed)

			if (!allowed) {
				this._logger.warn(`Rate limit exceeded for ${clientIp} on ${requestType}`, {
					clientIp,
					requestType,
					current: info.current,
					limit: info.limit,
					resetTime: info.resetTime,
				})

				throw new ThrottlerException('Rate limit exceeded')
			}

			this._logger.debug(`Rate limit pre-check passed for ${clientIp} on ${requestType}`, {
				clientIp,
				requestType,
				current: info.current,
				limit: info.limit,
				remaining: info.remaining,
			})
		}
		catch (error: unknown) {
			if (error instanceof ThrottlerException) {
				throw error
			}

			this._logger.error('Error in rate limit adaptive pre-check:', error)
			// Do not block on pre-check errors; fall through to ThrottlerGuard.
		}

		// Delegate to ThrottlerGuard for per-process in-memory counting.
		// This acts as a secondary safety net when Redis is unavailable.
		return super.canActivate(context)
	}

	/**
	 * Override shouldSkip so that health/metrics, static assets, whitelisted
	 * domains, and bot UAs from internal IPs all bypass the Throttler counters.
	 */
	protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		return this.shouldSkipRateLimit(request)
	}

	/**
	 * Override getTracker to use our IP-based key consistent with
	 * RateLimitService.generateAdvancedKey.
	 */
	protected override async getTracker(req: Record<string, any>): Promise<string> {
		return this.getClientIp(req)
	}

	/**
	 * Override generateKey to incorporate request type into the throttler key
	 * so that image-processing and default buckets are tracked separately.
	 */
	protected override generateKey(
		context: ExecutionContext,
		suffix: string,
		name: string,
	): string {
		const request = context.switchToHttp().getRequest()
		const requestType = this.getRequestType(request)
		return `${suffix}:${requestType}:${name}`
	}

	/**
	 * Determine if rate limiting should be skipped for this request.
	 */
	private shouldSkipRateLimit(request: any): boolean {
		const url = request.url || ''

		// Cheapest checks first (string startsWith)
		if (url.startsWith('/health') || url.startsWith('/metrics')) {
			return true
		}

		if (STATIC_ASSET_RE.test(url)) {
			return true
		}

		const userAgent = request.headers['user-agent'] || ''
		if (this.shouldBypassBot(userAgent) && this.isInternalIp(request)) {
			this._logger.debug('Skipping rate limiting for bot from internal IP', { userAgent })
			return true
		}

		// Most expensive check last (IP check + URL parsing + domain matching)
		if (this.isDomainWhitelisted(request)) {
			this._logger.debug('Skipping rate limiting for internal whitelisted domain', {
				ip: this.getClientIp(request),
				referer: request.headers.referer,
				origin: request.headers.origin,
			})
			return true
		}

		return false
	}

	/**
	 * Check if bot bypass is enabled and user agent is a bot.
	 */
	private shouldBypassBot(userAgent: string): boolean {
		if (this.cachedBypassBots === null) {
			this.cachedBypassBots = this.rateLimitService.getBypassBotsConfig()
		}
		if (!this.cachedBypassBots) {
			return false
		}

		return this.rateLimitService.isBot(userAgent)
	}

	/**
	 * Returns true only when the connecting IP is a private/loopback address.
	 * Referer and Origin are attacker-controlled HTTP headers, so the domain
	 * whitelist is only meaningful for requests that cannot be spoofed from the
	 * public internet — i.e. requests arriving from within the cluster or from
	 * localhost.
	 */
	private isInternalIp(request: any): boolean {
		const ip: string = this.getClientIp(request)

		// IPv4 loopback
		if (ip === '127.0.0.1')
			return true

		// IPv6 loopback
		if (ip === '::1' || ip === '::ffff:127.0.0.1')
			return true

		// Strip IPv4-mapped IPv6 prefix so the checks below work uniformly
		const bare = ip.startsWith('::ffff:') ? ip.slice(7) : ip

		const parts = bare.split('.').map(Number)
		if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) {
			// Not a dotted-decimal IPv4 address — treat as external
			return false
		}

		const [a, b] = parts

		// 10.0.0.0/8
		if (a === 10)
			return true

		// 172.16.0.0/12
		if (a === 172 && b >= 16 && b <= 31)
			return true

		// 192.168.0.0/16
		if (a === 192 && b === 168)
			return true

		return false
	}

	/**
	 * Check if the request comes from a whitelisted domain.
	 * Only trusted for requests arriving from internal/private IP ranges —
	 * Referer and Origin are fully attacker-controlled HTTP headers and MUST NOT
	 * be used to bypass rate limiting for requests from public IP addresses.
	 */
	private isDomainWhitelisted(request: any): boolean {
		try {
			// Guard: only apply the whitelist for internal-network callers.
			// An external client can trivially forge Referer/Origin headers.
			if (!this.isInternalIp(request)) {
				return false
			}

			if (this.cachedWhitelistedDomains === null) {
				this.cachedWhitelistedDomains = this.rateLimitService.getWhitelistedDomains()
			}
			const whitelistedDomains = this.cachedWhitelistedDomains

			if (!whitelistedDomains || whitelistedDomains.length === 0) {
				return false
			}

			const referer = request.headers.referer
			if (referer) {
				try {
					const refererUrl = new URL(referer)
					if (this.matchesDomain(refererUrl.hostname, whitelistedDomains)) {
						return true
					}
				}
				catch {
					// Invalid referer URL, continue checking other headers
				}
			}

			const origin = request.headers.origin
			if (origin) {
				try {
					const originUrl = new URL(origin)
					if (this.matchesDomain(originUrl.hostname, whitelistedDomains)) {
						return true
					}
				}
				catch {
					// Invalid origin URL, continue
				}
			}

			return false
		}
		catch (error: unknown) {
			this._logger.error('Error checking domain whitelist:', error)
			return false
		}
	}

	/**
	 * Check if a domain matches any of the whitelisted domains.
	 * Supports exact matches and wildcard subdomains (*.example.com).
	 */
	private matchesDomain(domain: string, whitelistedDomains: string[]): boolean {
		for (const whitelistedDomain of whitelistedDomains) {
			if (domain === whitelistedDomain) {
				return true
			}

			if (whitelistedDomain.startsWith('*.')) {
				const baseDomain = whitelistedDomain.substring(2)
				if (domain.endsWith(`.${baseDomain}`) || domain === baseDomain) {
					return true
				}
			}

			if (domain.endsWith(`.${whitelistedDomain}`)) {
				return true
			}
		}

		return false
	}

	/**
	 * Extract client IP address from request.
	 * Uses req.ip which reflects the real client IP when trust proxy = 1 is set
	 * (Express reads the rightmost untrusted address from X-Forwarded-For).
	 * Falls back to socket address — never trusts raw XFF headers directly.
	 */
	private getClientIp(request: any): string {
		return (
			request.ip
			|| request.socket?.remoteAddress
			|| request.connection?.remoteAddress
			|| 'unknown'
		)
	}

	/**
	 * Determine request type for rate limiting.
	 */
	private getRequestType(request: any): string {
		const url = request.url || ''
		const method = request.method || 'GET'

		if (url.includes('/media_stream-image/')) {
			return 'image-processing'
		}

		if (url.startsWith('/health')) {
			return 'health-check'
		}

		return `${method.toLowerCase()}-default`
	}

	/**
	 * Add rate limit headers to response.
	 * Emits RFC 6585 `Retry-After` alongside the X-RateLimit-* family only
	 * when the request was throttled — per the spec the header is intended
	 * for 429 responses. Value is seconds until reset (non-negative integer).
	 */
	private addRateLimitHeaders(response: any, info: any, allowed: boolean): void {
		response.setHeader('X-RateLimit-Limit', info.limit.toString())
		response.setHeader('X-RateLimit-Remaining', info.remaining.toString())
		response.setHeader('X-RateLimit-Reset', Math.ceil(info.resetTime.getTime() / 1000).toString())
		response.setHeader('X-RateLimit-Used', info.current.toString())

		if (!allowed) {
			const retryAfterSeconds = Math.max(1, Math.ceil((info.resetTime.getTime() - Date.now()) / 1000))
			response.setHeader('Retry-After', retryAfterSeconds.toString())
		}
	}
}
