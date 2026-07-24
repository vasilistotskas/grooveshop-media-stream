import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import type { RequestContext } from '../interfaces/correlation.interface.js'
import * as process from 'node:process'
import { Injectable } from '@nestjs/common'
import { getClientIp } from '#microservice/common/utils/ip.util'
import { CorrelationService } from '../services/correlation.service.js'

export const CORRELATION_ID_HEADER = 'x-correlation-id'

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
	constructor(private readonly _correlationService: CorrelationService) {}

	use(req: Request, res: Response, next: NextFunction): void {
		const correlationId
			= (req.headers[CORRELATION_ID_HEADER] as string) || this._correlationService.generateCorrelationId()

		// getClientIp reads req.ip, which Express resolves to the real client IP
		// from X-Forwarded-For because main.ts sets `trust proxy = 1` (exactly one
		// hop, i.e. Traefik). Reading the raw XFF header directly would allow an
		// external client to spoof their apparent address.
		const context: RequestContext = {
			correlationId,
			timestamp: Date.now(),
			clientIp: getClientIp(req),
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
}
