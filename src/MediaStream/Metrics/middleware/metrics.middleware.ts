import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { Buffer } from 'node:buffer'
import { Injectable } from '@nestjs/common'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '../services/metrics.service.js'

/**
 * The `route` label of a request no registered route matched (a 404 from
 * the router, a file under `public/`). Its path is whatever the client
 * sent, so it never becomes a label value.
 */
export const UNMATCHED_ROUTE = 'unmatched'

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
	constructor(private readonly metricsService: MetricsService) {}

	use(req: Request, res: Response, next: NextFunction): void {
		const startTime = Date.now()

		this.metricsService.incrementRequestsInFlight()

		const requestSize = this.getRequestSize(req)

		// Wrap res.end to measure the final chunk: Content-Length is not readable
		// on the `res.end(buffer)` path the image route uses.
		const originalEnd = res.end.bind(res)
		let responseSize = 0
		res.end = ((chunk?: unknown, encoding?: BufferEncoding, cb?: () => void): Response => {
			if (chunk) {
				responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk as string, encoding)
			}
			return originalEnd(chunk as never, encoding as never, cb)
		}) as Response['end']

		res.on('finish', () => {
			try {
				const duration = (Date.now() - startTime) / 1000
				const route = this.getRoute(req)

				this.metricsService.recordHttpRequest(req.method, route, res.statusCode, duration, requestSize, responseSize)
				this.metricsService.decrementRequestsInFlight()

				CorrelatedLogger.debug(`HTTP ${req.method} ${route} ${res.statusCode} - ${duration}s`, MetricsMiddleware.name)
			}
			catch (error: unknown) {
				CorrelatedLogger.error(`Failed to record HTTP metrics: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, MetricsMiddleware.name)
				this.metricsService.recordError('metrics_middleware', 'http_tracking')
			}
		})

		res.on('error', (error: unknown) => {
			CorrelatedLogger.error(`HTTP request error: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, MetricsMiddleware.name)
			this.metricsService.recordError('http_request', 'response_error')
			this.metricsService.decrementRequestsInFlight()
		})

		next()
	}

	private getRequestSize(req: Request): number {
		const contentLength = req.headers['content-length']
		if (contentLength) {
			return Number.parseInt(contentLength, 10) || 0
		}

		// GET requests carry no body; the URL length is a fair proxy
		return req.url.length
	}

	/**
	 * The registered route pattern (e.g. `/media_stream-image/*path`), so the
	 * label set is the service's route table and nothing a client can extend.
	 * No tenant label either: the schema segment is client-chosen too, and
	 * per-tenant numbers come from the `schema` field of the image request
	 * log (docs/observability.md).
	 */
	private getRoute(req: Request): string {
		const path: unknown = req.route?.path
		return typeof path === 'string' && path.length > 0 ? path : UNMATCHED_ROUTE
	}
}
