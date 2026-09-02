import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import * as process from 'node:process'
import { Injectable } from '@nestjs/common'
import { CorrelationService } from '../services/correlation.service.js'
import { CorrelatedLogger } from '../utils/logger.util.js'
import { PerformanceTracker } from '../utils/performance-tracker.util.js'

/** Requests slower than this are logged at warn with a performance alert. */
const SLOW_REQUEST_MS = 1000
/** Requests slower than this are logged at warn even when they succeed. */
const WARN_DURATION_MS = 2000

@Injectable()
export class TimingMiddleware implements NestMiddleware {
	constructor(private readonly correlationService: CorrelationService) {}

	use(req: Request, res: Response, next: NextFunction): void {
		const startTime = process.hrtime.bigint()
		const startTimestamp = Date.now()

		res.setHeader('x-request-start', startTimestamp.toString())

		const originalEnd = res.end.bind(res)
		res.end = ((chunk?: unknown, encoding?: BufferEncoding, cb?: () => void): Response => {
			const endTime = process.hrtime.bigint()
			const endTimestamp = Date.now()
			const duration = Number(endTime - startTime) / 1_000_000

			if (!res.headersSent) {
				res.setHeader('x-response-time', `${duration.toFixed(2)}ms`)
				res.setHeader('x-request-end', endTimestamp.toString())
			}

			this.correlationService.updateContext({ startTime, endTime, duration, startTimestamp, endTimestamp })

			const context = this.correlationService.getContext()
			if (context) {
				const message = `${req.method} ${req.url} - ${res.statusCode} - ${duration.toFixed(2)}ms`

				switch (this.getLogLevel(duration, res.statusCode)) {
					case 'error':
						CorrelatedLogger.error(`FAILED REQUEST: ${message}`, undefined, TimingMiddleware.name)
						break
					case 'warn':
						CorrelatedLogger.warn(`SLOW REQUEST: ${message}`, TimingMiddleware.name)
						break
					default:
						CorrelatedLogger.debug(message, TimingMiddleware.name)
				}

				if (duration > SLOW_REQUEST_MS) {
					CorrelatedLogger.warn(`Performance Alert: Request took ${duration.toFixed(2)}ms - consider optimization`, TimingMiddleware.name)
				}

				PerformanceTracker.logSummary()
				// logSummary clears the current request's phases; this covers the
				// no-phase case so the tracker never retains a finished request.
				PerformanceTracker.cleanup(context.correlationId)
			}

			return originalEnd(chunk as never, encoding as never, cb)
		}) as Response['end']

		next()
	}

	private getLogLevel(duration: number, statusCode: number): 'debug' | 'warn' | 'error' {
		if (statusCode >= 500) {
			return 'error'
		}
		if (statusCode >= 400 || duration > WARN_DURATION_MS) {
			return 'warn'
		}
		return 'debug'
	}
}
