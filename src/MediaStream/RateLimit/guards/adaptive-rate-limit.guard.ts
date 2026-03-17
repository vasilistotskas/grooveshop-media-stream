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
		if (this.shouldBypassBot(userAgent)) {
			this._logger.debug('Skipping rate limiting for bot', { userAgent })
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

			this.addRateLimitHeaders(response, info)

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

		if (this.isDomainWhitelisted(request)) {
			this._logger.debug('Skipping rate limiting for whitelisted domain', {
				referer: request.headers.referer,
				origin: request.headers.origin,
			})
			return true
		}

		if (url.startsWith('/health')) {
			return true
		}

		if (url.startsWith('/metrics')) {
			return true
		}

		if (STATIC_ASSET_RE.test(url)) {
			return true
		}

		return false
	}

	/**
	 * Check if bot bypass is enabled and user agent is a bot
	 */
	private shouldBypassBot(userAgent: string): boolean {
		const bypassBots = this.rateLimitService.getBypassBotsConfig()
		if (!bypassBots) {
			return false
		}

		return this.rateLimitService.isBot(userAgent)
	}

	/**
	 * Check if the request comes from a whitelisted domain
	 */
	private isDomainWhitelisted(request: any): boolean {
		try {
			const whitelistedDomains = this.rateLimitService.getWhitelistedDomains()

			if (!whitelistedDomains || whitelistedDomains.length === 0) {
				return false
			}

			const referer = request.headers.referer
			if (referer) {
				try {
					const refererUrl = new URL(referer)
					const refererDomain = refererUrl.hostname

					if (this.matchesDomain(refererDomain, whitelistedDomains)) {
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
					const originDomain = originUrl.hostname

					if (this.matchesDomain(originDomain, whitelistedDomains)) {
						return true
					}
				}
				catch {
					// Invalid origin URL, continue
				}
			}

			const host = request.headers.host
			if (host) {
				const hostDomain = host.split(':')[0]
				if (this.matchesDomain(hostDomain, whitelistedDomains)) {
					return true
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
	 * Add rate limit headers to response
	 */
	private addRateLimitHeaders(response: any, info: any): void {
		response.setHeader('X-RateLimit-Limit', info.limit.toString())
		response.setHeader('X-RateLimit-Remaining', info.remaining.toString())
		response.setHeader('X-RateLimit-Reset', Math.ceil(info.resetTime.getTime() / 1000).toString())
		response.setHeader('X-RateLimit-Used', info.current.toString())
	}
}
