import { Buffer } from 'node:buffer'
import { Injectable, Logger, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { MetricsService } from '../services/metrics.service'

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
	private readonly _logger = new Logger(MetricsMiddleware.name)

	constructor(private readonly metricsService: MetricsService) {}

	use(req: Request, res: Response, next: NextFunction): void {
		const startTime = Date.now()

		// Track request in flight
		this.metricsService.incrementRequestsInFlight()

		// Get request size
		const requestSize = this.getRequestSize(req)

		// Override res.end to capture response metrics
		const originalEnd = res.end.bind(res)
		let responseSize = 0

		res.end = function (chunk?: any, encoding?: any, cb?: any): Response {
			if (chunk) {
				responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding)
			}

			// Call original end method
			return originalEnd(chunk, encoding, cb)
		} as any

		// Handle response completion
		res.on('finish', () => {
			try {
				const duration = (Date.now() - startTime) / 1000
				const route = this.getRoute(req)

				// Record HTTP metrics
				this.metricsService.recordHttpRequest(
					req.method,
					route,
					res.statusCode,
					duration,
					requestSize,
					responseSize,
				)

				// Track request completion
				this.metricsService.decrementRequestsInFlight()

				this._logger.debug(`HTTP ${req.method} ${route} ${res.statusCode} - ${duration}s`)
			}
			catch (error: unknown) {
				this._logger.error('Failed to record HTTP metrics:', error)
				this.metricsService.recordError('metrics_middleware', 'http_tracking')
			}
		})

		// Handle request errors
		res.on('error', (error: unknown) => {
			this._logger.error('HTTP request error:', error)
			this.metricsService.recordError('http_request', 'response_error')
			this.metricsService.decrementRequestsInFlight()
		})

		next()
	}

	private getRequestSize(req: Request): number {
		const contentLength = req.get('content-length')
		if (contentLength) {
			return Number.parseInt(contentLength, 10) || 0
		}

		// Estimate size from headers and body
		let size = 0

		// Add headers size
		for (const [key, value] of Object.entries(req.headers)) {
			size += key.length + (Array.isArray(value) ? value.join('').length : String(value).length)
		}

		// Add URL size
		size += req.url.length

		return size
	}

	private getRoute(req: Request): string {
		// Try to get the route pattern from NestJS
		if (req.route?.path) {
			return req.route.path
		}

		// Fallback to URL pathname with parameter normalization
		const pathname = req.url.split('?')[0]

		// Normalize common patterns
		return pathname
			.replace(/\/\d+/g, '/:id') // Replace numeric IDs
			.replace(/\/[a-f0-9-]{36}/g, '/:uuid') // Replace UUIDs
			.replace(/\/[a-f0-9]{24}/g, '/:objectId') // Replace MongoDB ObjectIds
	}
}
