import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { Buffer } from 'node:buffer'
import { Injectable } from '@nestjs/common'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { extractTenantSchemaFromPath } from '#microservice/common/utils/tenant-path.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '../services/metrics.service.js'

const UUID_RE = /\/[a-f0-9-]{36}/g
const OBJECT_ID_RE = /\/[a-f0-9]{24}/g
const NUMERIC_ID_RE = /\/\d+/g
/** Unmatched paths are capped at this many segments so 404 noise cannot explode label cardinality. */
const MAX_ROUTE_SEGMENTS = 5

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
				const tenantSchema = extractTenantSchemaFromPath(this.pathname(req))

				this.metricsService.recordHttpRequest(req.method, route, res.statusCode, duration, requestSize, responseSize, tenantSchema)
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

	/** Normalise ids so the `route` label stays low-cardinality. */
	private getRoute(req: Request): string {
		if (req.route?.path) {
			return req.route.path
		}

		const normalized = this.pathname(req)
			.replace(UUID_RE, '/:uuid')
			.replace(OBJECT_ID_RE, '/:objectId')
			.replace(NUMERIC_ID_RE, '/:id')

		return normalized.split('/').slice(0, MAX_ROUTE_SEGMENTS).join('/') || '/'
	}

	private pathname(req: Request): string {
		return req.url.split('?')[0]
	}
}
