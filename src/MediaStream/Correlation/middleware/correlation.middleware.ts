import * as process from 'node:process'
import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { RequestContext } from '../interfaces/correlation.interface'
import { CorrelationService } from '../services/correlation.service'

export const CORRELATION_ID_HEADER = 'x-correlation-id'

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
	constructor(private readonly _correlationService: CorrelationService) {}

	use(req: Request, res: Response, next: NextFunction): void {
		// Get correlation ID from header or generate new one
		const correlationId
      = (req.headers[CORRELATION_ID_HEADER] as string) || this._correlationService.generateCorrelationId()

		// Create request context
		const context: RequestContext = {
			correlationId,
			timestamp: Date.now(),
			clientIp: this.getClientIp(req),
			userAgent: req.headers['user-agent'],
			method: req.method,
			url: req.url,
			startTime: process.hrtime.bigint(),
		}

		// Set correlation ID in response header
		res.setHeader(CORRELATION_ID_HEADER, correlationId)

		// Run the request within the correlation context
		this._correlationService.runWithContext(context, () => {
			next()
		})
	}

	private getClientIp(req: Request): string {
		return (
			(req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
			|| (req.headers['x-real-ip'] as string)
			|| req.connection.remoteAddress
			|| req.socket.remoteAddress
			|| 'unknown'
		)
	}
}
