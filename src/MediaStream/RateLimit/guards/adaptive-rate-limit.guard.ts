import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { RateLimitConfig } from '#microservice/Config/interfaces/app-config.interface'
import type { RateLimitInfo } from '../services/rate-limit.service.js'
import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { IMAGE } from '#microservice/common/constants/route-prefixes.constant'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { getClientIp, isInternalIp } from '#microservice/common/utils/ip.util'
import { extractTenantSchemaFromPath } from '#microservice/common/utils/tenant-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { TenantDomainsService } from '#microservice/Validation/services/tenant-domains.service'
import { RateLimitService } from '../services/rate-limit.service.js'

const STATIC_ASSET_RE = /\.(?:css|js|png|jpg|jpeg|gif|ico|svg)$/
const IMAGE_ROUTE_SEGMENT = `/${IMAGE}/`
const HEALTH_PREFIX = '/health'
const CIRCUIT_BREAKER_RESET_PATH = '/health/circuit-breaker/reset'

/** Minimal request shape the guard reads; matches Express and the spec doubles. */
interface GuardRequest {
	url?: string
	method?: string
	ip?: string
	headers: Record<string, string | string[] | undefined>
	socket?: { remoteAddress?: string }
}

interface GuardResponse {
	setHeader: (name: string, value: string) => unknown
}

/**
 * Adaptive, distributed rate limiting.
 *
 *  1. Bypass fast path: health probes, static assets under public/, bots from
 *     internal IPs, and whitelisted internal referers. `/metrics` is
 *     deliberately NOT exempt (defence in depth beside InternalSecretGuard).
 *  2. The effective limit shrinks under heap pressure (RateLimitService).
 *  3. The counter is a Redis Lua INCR+EXPIRE, with an in-process fallback when
 *     Redis is unavailable (RateLimitService.checkRateLimit).
 *
 * A limiter fault must never 500 a request, so internal errors fail open.
 * `RATE_LIMIT_ENABLED=false` is the operator kill-switch.
 */
@Injectable()
export class AdaptiveRateLimitGuard implements CanActivate {
	private readonly enabled: boolean
	private readonly bypassHealthChecks: boolean
	private readonly bypassStaticAssets: boolean
	private readonly bypassBots: boolean
	private readonly whitelistedDomains: readonly string[]

	constructor(
		configService: ConfigService,
		private readonly rateLimitService: RateLimitService,
		private readonly metricsService: MetricsService,
		private readonly tenantDomainsService: TenantDomainsService,
	) {
		const config = configService.get<RateLimitConfig>('rateLimit')
		this.enabled = config.enabled
		this.bypassHealthChecks = config.bypass.healthChecks
		this.bypassStaticAssets = config.bypass.staticAssets
		this.bypassBots = config.bypass.bots
		this.whitelistedDomains = config.bypass.whitelistedDomains
	}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		if (!this.enabled) {
			return true
		}

		const request = context.switchToHttp().getRequest<GuardRequest>()
		if (this.shouldSkip(request)) {
			return true
		}

		try {
			const clientIp = getClientIp(request)
			const requestType = this.getRequestType(request)
			const userAgent = this.headerValue(request, 'user-agent')
			const tenantSchema = extractTenantSchemaFromPath(this.pathname(request))

			const key = this.rateLimitService.generateAdvancedKey(clientIp, userAgent, requestType, tenantSchema)
			const config = this.rateLimitService.getRateLimitConfig(requestType)
			const max = await this.rateLimitService.calculateAdaptiveLimit(config.max)

			const { allowed, info } = await this.rateLimitService.checkRateLimit(key, { ...config, max })

			this.rateLimitService.recordRateLimitMetrics(requestType, allowed, info)
			this.metricsService.recordRateLimitAttempt(requestType, allowed)
			this.addRateLimitHeaders(context.switchToHttp().getResponse<GuardResponse>(), info, allowed)

			if (!allowed) {
				CorrelatedLogger.warn(
					`Rate limit exceeded for ${clientIp} on ${requestType} (${info.current}/${info.limit}, resets ${info.resetTime.toISOString()})`,
					AdaptiveRateLimitGuard.name,
				)
				throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS)
			}

			CorrelatedLogger.debug(
				`Rate limit check passed for ${clientIp} on ${requestType} (${info.current}/${info.limit}, ${info.remaining} remaining)`,
				AdaptiveRateLimitGuard.name,
			)
		}
		catch (error: unknown) {
			if (error instanceof HttpException) {
				throw error
			}

			CorrelatedLogger.error(
				`Rate limit check failed, allowing request: ${errorMessage(error)}`,
				error instanceof Error ? error.stack : undefined,
				AdaptiveRateLimitGuard.name,
			)
		}

		return true
	}

	/**
	 * Cheapest checks first. K8s probes (/health, /health/live, /health/ready)
	 * fire every few seconds and must never be throttled; the circuit-breaker
	 * reset is auth-gated and stays limited as defence in depth.
	 */
	private shouldSkip(request: GuardRequest): boolean {
		const url = request.url ?? ''
		const method = request.method ?? 'GET'

		if (this.bypassHealthChecks && url.startsWith(HEALTH_PREFIX) && !(url === CIRCUIT_BREAKER_RESET_PATH && method === 'POST')) {
			return true
		}

		// Static-asset bypass covers files served from public/ only. Image
		// routes end in `:quality.:format` (e.g. `/…/80.png`), so they must be
		// excluded or a png/jpg/gif/svg output format would skip the throttle.
		if (this.bypassStaticAssets && !url.includes(IMAGE_ROUTE_SEGMENT) && STATIC_ASSET_RE.test(url)) {
			return true
		}

		const userAgent = this.headerValue(request, 'user-agent')
		if (this.bypassBots && this.rateLimitService.isBot(userAgent) && isInternalIp(getClientIp(request))) {
			CorrelatedLogger.debug(`Skipping rate limiting for bot from internal IP: ${userAgent}`, AdaptiveRateLimitGuard.name)
			return true
		}

		if (this.isDomainWhitelisted(request)) {
			CorrelatedLogger.debug(`Skipping rate limiting for internal whitelisted domain (ip: ${getClientIp(request)})`, AdaptiveRateLimitGuard.name)
			return true
		}

		return false
	}

	/**
	 * Referer/Origin are attacker-controlled, so the whitelist only applies to
	 * internal-IP callers. A hostname passes if it matches the static env list
	 * (an entry also covers its subdomains) OR the dynamic tenant-domain set, which is
	 * deliberately not cached so newly onboarded tenants bypass immediately.
	 */
	private isDomainWhitelisted(request: GuardRequest): boolean {
		if (!isInternalIp(getClientIp(request))) {
			return false
		}

		for (const header of ['referer', 'origin'] as const) {
			const value = this.headerValue(request, header)
			if (!value) {
				continue
			}
			try {
				if (this.isHostnameWhitelisted(new URL(value).hostname)) {
					return true
				}
			}
			catch {
				// Invalid URL in the header — try the next one
			}
		}

		return false
	}

	private isHostnameWhitelisted(hostname: string): boolean {
		return this.matchesDomain(hostname) || this.tenantDomainsService.isAllowed(hostname)
	}

	/** An entry matches itself and every subdomain; a leading `*.` is accepted and ignored. */
	private matchesDomain(hostname: string): boolean {
		return this.whitelistedDomains.some((whitelisted) => {
			const domain = whitelisted.startsWith('*.') ? whitelisted.slice(2) : whitelisted
			return hostname === domain || hostname.endsWith(`.${domain}`)
		})
	}

	private getRequestType(request: GuardRequest): string {
		const url = request.url ?? ''
		if (url.includes(IMAGE_ROUTE_SEGMENT)) {
			return 'image-processing'
		}
		if (url.startsWith(HEALTH_PREFIX)) {
			return 'health-check'
		}
		return `${(request.method ?? 'GET').toLowerCase()}-default`
	}

	/**
	 * X-RateLimit-* on every counted response; RFC 6585 `Retry-After` (seconds
	 * until the window resets) only when the request was throttled.
	 */
	private addRateLimitHeaders(response: GuardResponse, info: RateLimitInfo, allowed: boolean): void {
		response.setHeader('X-RateLimit-Limit', info.limit.toString())
		response.setHeader('X-RateLimit-Remaining', info.remaining.toString())
		response.setHeader('X-RateLimit-Reset', Math.ceil(info.resetTime.getTime() / 1000).toString())
		response.setHeader('X-RateLimit-Used', info.current.toString())

		if (!allowed) {
			const retryAfterSeconds = Math.max(1, Math.ceil((info.resetTime.getTime() - Date.now()) / 1000))
			response.setHeader('Retry-After', retryAfterSeconds.toString())
		}
	}

	private headerValue(request: GuardRequest, name: string): string {
		const value = request.headers[name]
		return Array.isArray(value) ? value[0] ?? '' : value ?? ''
	}

	private pathname(request: GuardRequest): string {
		return (request.url ?? '').split('?')[0]
	}
}
