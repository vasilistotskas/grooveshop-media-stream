import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { ThrottlerException } from '@nestjs/throttler'
import { RateLimitMetricsService } from '../services/rate-limit-metrics.service'
import { RateLimitService } from '../services/rate-limit.service'

@Injectable()
export class AdaptiveRateLimitGuard implements CanActivate {
	private readonly _logger = new Logger(AdaptiveRateLimitGuard.name)

	constructor(
		private readonly rateLimitService: RateLimitService,
		private readonly rateLimitMetricsService: RateLimitMetricsService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const response = context.switchToHttp().getResponse()

		// Skip rate limiting for health checks
		if (this.shouldSkipRateLimit(request)) {
			return true
		}

		try {
			// Get client IP and request type
			const clientIp = this.getClientIp(request)
			const requestType = this.getRequestType(request)
			const userAgent = request.headers['user-agent'] || ''

			// Generate rate limit key
			const rateLimitKey = this.rateLimitService.generateAdvancedKey(clientIp, userAgent, requestType)

			// Get rate limit configuration for this request type
			const config = this.rateLimitService.getRateLimitConfig(requestType)

			// Apply adaptive rate limiting based on system load
			const adaptiveLimit = await this.rateLimitService.calculateAdaptiveLimit(config.max)
			const adaptiveConfig = { ...config, max: adaptiveLimit }

			// Check rate limit
			const { allowed, info } = await this.rateLimitService.checkRateLimit(rateLimitKey, adaptiveConfig)

			// Record metrics
			this.rateLimitService.recordRateLimitMetrics(requestType, allowed, info)
			this.rateLimitMetricsService.recordRateLimitAttempt(requestType, clientIp, allowed)

			// Add rate limit headers to response
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
			// In case of error, allow the request to proceed to avoid blocking legitimate traffic
			return true
		}
	}

	/**
	 * Determine if rate limiting should be skipped for this request
	 */
	private shouldSkipRateLimit(request: any): boolean {
		const url = request.url || ''

		// Skip health checks
		if (url.startsWith('/health')) {
			return true
		}

		// Skip metrics endpoint
		if (url.startsWith('/metrics')) {
			return true
		}

		// Skip static assets (if any)
		if (url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg)$/)) {
			return true
		}

		return false
	}

	/**
	 * Extract client IP address from request
	 */
	private getClientIp(request: any): string {
		return (
			request.headers['x-forwarded-for']?.split(',')[0]
			|| request.headers['x-real-ip']
			|| request.connection?.remoteAddress
			|| request.socket?.remoteAddress
			|| request.ip
			|| 'unknown'
		)
	}

	/**
	 * Determine request type for rate limiting
	 */
	private getRequestType(request: any): string {
		const url = request.url || ''
		const method = request.method || 'GET'

		// Image processing requests
		if (url.includes('/media/uploads/') || url.includes('/static/images/') || url.includes('/image-processing')) {
			return 'image-processing'
		}

		// Health check requests
		if (url.startsWith('/health')) {
			return 'health-check'
		}

		// Default request type
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
