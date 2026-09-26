import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import type { ImageRequestLog, ImageRequestOutcome } from '#microservice/Correlation/utils/image-request-log.util'
import * as process from 'node:process'
import { Injectable } from '@nestjs/common'
import { IMAGE } from '#microservice/common/constants/route-prefixes.constant'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { requestContextStorage } from '#microservice/Correlation/async-local-storage'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { SupportedResizeFormats } from '../dto/cache-image-request.dto.js'

/** Longest request path a log line carries; the route itself accepts nested paths of any length. */
export const MAX_LOGGED_PATH_LENGTH = 512

/** Logger context of the per-request line: `log.context:ImageRequest` selects exactly those lines. */
export const IMAGE_REQUEST_LOG_CONTEXT = 'ImageRequest'

const OUTPUT_FORMATS: ReadonlySet<string> = new Set(Object.values(SupportedResizeFormats))
const ROUTE_PREFIX = `/${IMAGE}/`

export function truncateForLog(value: string, maxLength: number): string {
	return value.length > maxLength ? value.slice(0, maxLength) : value
}

/** The outcome of a request nothing on the image path classified: a guard, the router or the exception filter answered. */
function outcomeForStatus(status: number): ImageRequestOutcome {
	if (status < 400) {
		return 'ok'
	}
	if (status === 429) {
		return 'rate_limited'
	}
	return status < 500 ? 'invalid' : 'error'
}

/**
 * One structured line and one metrics sample per image request, emitted
 * when the response closes, whatever answered it: the pipeline, the rate
 * limit guard, validation, the router or the exception filter.
 *
 * The record it creates rides on the request's AsyncLocalStorage context,
 * where the pipeline fills it in (`currentImageRequest()`). Everything in it
 * is a number, a short string or a closed enum: no image bytes, no headers,
 * no query string. Registered after CorrelationMiddleware, whose context it
 * extends.
 *
 * `close` fires once the response has been handed off or the connection
 * died first; `writableFinished` tells the two apart (Node.js
 * `http.ServerResponse` docs), so a client that gives up is logged as
 * `aborted` rather than with a status it never received.
 */
@Injectable()
export class ImageRequestLogMiddleware implements NestMiddleware {
	constructor(private readonly metricsService: MetricsService) {}

	use(req: Request, res: Response, next: NextFunction): void {
		const context = requestContextStorage.getStore()
		// originalUrl, not path: a mounted middleware sees `path` relative to its mount point.
		const pathname = req.originalUrl.split('?', 1)[0]
		const record: ImageRequestLog = {
			correlationId: context?.correlationId ?? '',
			startedAt: process.hrtime.bigint(),
			// Raw until the controller replaces it with the decoded form.
			path: truncateForLog(pathname.startsWith(ROUTE_PREFIX) ? pathname.slice(ROUTE_PREFIX.length) : pathname, MAX_LOGGED_PATH_LENGTH),
			admissionWaitMs: 0,
		}
		if (context) {
			context.imageRequest = record
		}

		res.once('close', () => this.complete(record, res))
		next()
	}

	private complete(record: ImageRequestLog, res: Response): void {
		try {
			const outcome = res.writableFinished ? record.outcome ?? outcomeForStatus(res.statusCode) : 'aborted'
			const durationMs = Number(process.hrtime.bigint() - record.startedAt) / 1e6

			CorrelatedLogger.event(
				outcome === 'rejected' ? 'warn' : 'log',
				`image ${outcome} ${res.statusCode} ${Math.round(durationMs)}ms`,
				{
					correlation_id: record.correlationId,
					schema: record.schema,
					source: record.source,
					path: record.path,
					width: record.width,
					height: record.height,
					fit: record.fit,
					position: record.position,
					format: record.format,
					quality: record.quality,
					cache: record.cache,
					coalesced: record.coalesced,
					input_format: record.inputFormat,
					input_bytes: record.inputBytes,
					output_format: record.outputFormat,
					output_bytes: record.outputBytes,
					admission_wait_ms: Math.round(record.admissionWaitMs),
					duration_ms: Math.round(durationMs),
					status: res.statusCode,
					outcome,
					error: record.error,
				},
				IMAGE_REQUEST_LOG_CONTEXT,
			)

			const format = record.format !== undefined && OUTPUT_FORMATS.has(record.format) ? record.format : 'none'
			this.metricsService.recordImageRequest(outcome, format, record.cache ?? 'none', durationMs / 1000)
		}
		catch (error: unknown) {
			// A throw in a `close` listener would be an uncaught exception.
			CorrelatedLogger.error(`Failed to record the image request: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, ImageRequestLogMiddleware.name)
		}
	}
}
