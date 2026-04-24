import type { CanActivate, ExecutionContext } from '@nestjs/common'
import * as process from 'node:process'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Injectable, Logger } from '@nestjs/common'
import { ThrottlerException } from '@nestjs/throttler'
import { RateLimitService } from '../services/rate-limit.service.js'

const STATIC_ASSET_RE = /\.(?:css|js|png|jpg|jpeg|gif|ico|svg)$/

@Injectable()
export class AdaptiveRateLimitGuard implements CanActivate {
	private readonly _logger = new Logger(AdaptiveRateLimitGuard.name)
	private cachedWhitelistedDomains: string[] | null = null
	private cachedBypassBots: boolean | null = null

	constructor(
		private readonly rateLimitService: RateLimitService,
		private readonly metricsService: MetricsService,
	) { }

	async canActivate(context: ExecutionContext): Promise<boolean> {
		if (process.env.NODE_ENV === 'development') {
			this._logger.debug('Skipping rate limiting in development mode')
			return true
		}

		const request = context.switchToHttp().getRequest()
		const response = context.switchToHttp().getResponse()

		if (this.shouldSkipRateLimit(request)) {
			return true
		}

		const userAgent = request.headers['user-agent'] || ''
		if (this.shouldBypassBot(userAgent) && this.isInternalIp(request)) {
			this._logger.debug('Skipping rate limiting for bot from internal IP', { userAgent })
			return true
		}

		try {
			const clientIp = this.getClientIp(request)
			const requestType = this.getRequestType(request)
			const userAgent = request.headers['user-agent'] || ''

			const rateLimitKey = this.rateLimitService.generateAdvancedKey(clientIp, userAgent, requestType)

			const config = this.rateLimitService.getRateLimitConfig(requestType)

			const adaptiveLimit = await this.rateLimitService.calculateAdaptiveLimit(config.max)
			const adaptiveConfig = { ...config, max: adaptiveLimit }

			const { allowed, info } = await this.rateLimitService.checkRateLimit(rateLimitKey, adaptiveConfig)

			this.rateLimitService.recordRateLimitMetrics(requestType, allowed, info)
			this.metricsService.recordRateLimitAttempt(requestType, allowed)

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

			this._logger.debug(`Rate limit check passed for ${clientIp} on ${requestType}`, {
				clientIp,
				requestType,
				current: info.current,
				limit: info.limit,
				remaining: info.remaining,
			})

			return true
		}
		catch (error: unknown) {
			if (error instanceof ThrottlerException) {
				throw error
			}

			this._logger.error('Error in rate limit guard:', error)
			return true
		}
	}

	/**
	 * Determine if rate limiting should be skipped for this request
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
	 * Check if bot bypass is enabled and user agent is a bot
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
	 * Check if a domain matches any of the whitelisted domains
	 * Supports exact matches and wildcard subdomains (*.example.com)
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
	 * Uses req.ip which respects NestJS/Express trust proxy setting.
	 * Falls back to socket address — never trusts X-Forwarded-For directly.
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
	 * Determine request type for rate limiting
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
