import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import * as process from 'node:process'
import { Injectable } from '@nestjs/common'
import { CorrelationService } from '../services/correlation.service'
import { CorrelatedLogger } from '../utils/logger.util'
import { PerformanceTracker } from '../utils/performance-tracker.util'

@Injectable()
export class TimingMiddleware implements NestMiddleware {
	constructor(private readonly _correlationService: CorrelationService) {}

	use(req: Request, res: Response, next: NextFunction): void {
		const startTime = process.hrtime.bigint()
		const startTimestamp = Date.now()

		res.setHeader('x-request-start', startTimestamp.toString())

		const originalEnd = res.end.bind(res)
		const correlationService = this._correlationService
		res.end = function (chunk?: any, encoding?: any, cb?: any): Response {
			const endTime = process.hrtime.bigint()
			const endTimestamp = Date.now()
			const duration = Number(endTime - startTime) / 1_000_000

			if (!res.headersSent) {
				res.setHeader('x-response-time', `${duration.toFixed(2)}ms`)
				res.setHeader('x-request-end', endTimestamp.toString())
			}

			correlationService.updateContext({
				startTime,
				endTime,
				duration,
				startTimestamp,
				endTimestamp,
			})

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

				if (duration > 1000) {
					CorrelatedLogger.warn(
						`Performance Alert: Request took ${duration.toFixed(2)}ms - consider optimization`,
						TimingMiddleware.name,
					)
				}

				PerformanceTracker.logSummary()
			}

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
