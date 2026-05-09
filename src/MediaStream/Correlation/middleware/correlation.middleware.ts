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

	/**
	 * Extract the real client IP.
	 *
	 * Now that `app.set('trust proxy', 1)` is configured in main.ts, Express
	 * resolves `req.ip` to the real client IP from X-Forwarded-For (trusting
	 * exactly 1 hop, i.e. Traefik).  Reading the raw XFF header directly would
	 * allow an external client to prepend arbitrary IPs to the header and spoof
	 * their apparent address.
	 */
	private getClientIp(req: Request): string {
		return (req as any).ip || req.socket?.remoteAddress || 'unknown'
	}
}
