import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import type { RequestContext } from '../interfaces/correlation.interface.js'
import * as process from 'node:process'
import { Injectable } from '@nestjs/common'
import { CorrelationService } from '../services/correlation.service.js'

export const CORRELATION_ID_HEADER = 'x-correlation-id'

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
	constructor(private readonly _correlationService: CorrelationService) {}

	use(req: Request, res: Response, next: NextFunction): void {
		const correlationId
			= (req.headers[CORRELATION_ID_HEADER] as string) || this._correlationService.generateCorrelationId()

		const context: RequestContext = {
			correlationId,
			timestamp: Date.now(),
			clientIp: this.getClientIp(req),
			userAgent: req.headers['user-agent'],
			method: req.method,
			url: req.url,
			startTime: process.hrtime.bigint(),
		}

		res.setHeader(CORRELATION_ID_HEADER, correlationId)

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
