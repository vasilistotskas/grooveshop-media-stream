import * as process from 'node:process'
import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { CorrelationService } from '../services/correlation.service'
import { CorrelatedLogger } from '../utils/logger.util'
import { PerformanceTracker } from '../utils/performance-tracker.util'

@Injectable()
export class TimingMiddleware implements NestMiddleware {
	constructor(private readonly correlationService: CorrelationService) {}

	use(req: Request, res: Response, next: NextFunction): void {
		const startTime = process.hrtime.bigint()
		const startTimestamp = Date.now()

		// Set initial timing headers
		res.setHeader('x-request-start', startTimestamp.toString())

		// Override res.end to capture final timing
		const originalEnd = res.end.bind(res)
		const correlationService = this.correlationService
		res.end = function (chunk?: any, encoding?: any, cb?: any): Response {
			const endTime = process.hrtime.bigint()
			const endTimestamp = Date.now()
			const duration = Number(endTime - startTime) / 1_000_000 // Convert to milliseconds

			// Set timing headers before ending response
			if (!res.headersSent) {
				res.setHeader('x-response-time', `${duration.toFixed(2)}ms`)
				res.setHeader('x-request-end', endTimestamp.toString())
			}

			// Update correlation context with comprehensive timing info
			correlationService.updateContext({
				startTime,
				endTime,
				duration,
				startTimestamp,
				endTimestamp,
			})

			// Enhanced logging with performance categorization
			const context = correlationService.getContext()
			if (context) {
				const logLevel = TimingMiddleware.prototype.getLogLevel(duration, res.statusCode)
				const message = `${req.method} ${req.url} - ${res.statusCode} - ${duration.toFixed(2)}ms`

				if (logLevel === 'warn') {
					CorrelatedLogger.warn(`SLOW REQUEST: ${message}`, TimingMiddleware.name)
				}
				else if (logLevel === 'error') {
					CorrelatedLogger.error(`FAILED REQUEST: ${message}`, '', TimingMiddleware.name)
				}
				else {
					CorrelatedLogger.debug(message, TimingMiddleware.name)
				}

				// Log additional performance metrics for slow requests
				if (duration > 1000) {
					CorrelatedLogger.warn(
						`Performance Alert: Request took ${duration.toFixed(2)}ms - consider optimization`,
						TimingMiddleware.name,
					)
				}

				// Log performance summary for the request
				PerformanceTracker.logSummary()
			}

			// Call original end method
			return originalEnd(chunk, encoding, cb)
		} as any

		next()
	}

	/**
	 * Determine appropriate log level based on response time and status code
	 */
	private getLogLevel(duration: number, statusCode: number): 'debug' | 'warn' | 'error' {
		if (statusCode >= 500) {
			return 'error'
		}
		if (statusCode >= 400 || duration > 2000) {
			return 'warn'
		}
		return 'debug'
	}
}
