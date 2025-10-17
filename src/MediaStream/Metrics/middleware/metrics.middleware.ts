import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { Buffer } from 'node:buffer'
import { Injectable, Logger } from '@nestjs/common'
import { MetricsService } from '../services/metrics.service.js'

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
	private readonly _logger = new Logger(MetricsMiddleware.name)

	constructor(private readonly metricsService: MetricsService) {}

	use(req: Request, res: Response, next: NextFunction): void {
		const startTime = Date.now()

		this.metricsService.incrementRequestsInFlight()

		const requestSize = this.getRequestSize(req)

		const originalEnd = res.end.bind(res)
		let responseSize = 0

		res.end = function (chunk?: any, encoding?: any, cb?: any): Response {
			if (chunk) {
				responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding)
			}

			return originalEnd(chunk, encoding, cb)
		} as any

		res.on('finish', () => {
			try {
				const duration = (Date.now() - startTime) / 1000
				const route = this.getRoute(req)

				this.metricsService.recordHttpRequest(
					req.method,
					route,
					res.statusCode,
					duration,
					requestSize,
					responseSize,
				)

				this.metricsService.decrementRequestsInFlight()

				this._logger.debug(`HTTP ${req.method} ${route} ${res.statusCode} - ${duration}s`)
			}
			catch (error: unknown) {
				this._logger.error('Failed to record HTTP metrics:', error)
				this.metricsService.recordError('metrics_middleware', 'http_tracking')
			}
		})

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

		let size = 0

		for (const [key, value] of Object.entries(req.headers)) {
			size += key.length + (Array.isArray(value) ? value.join('').length : String(value).length)
		}

		size += req.url.length

		return size
	}

	private getRoute(req: Request): string {
		if (req.route?.path) {
			return req.route.path
		}

		const pathname = req.url.split('?')[0]

		return pathname
			.replace(/\/\d+/g, '/:id')
			.replace(/\/[a-f0-9-]{36}/g, '/:uuid')
			.replace(/\/[a-f0-9]{24}/g, '/:objectId')
	}
}
