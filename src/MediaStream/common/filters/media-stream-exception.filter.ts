import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Catch, HttpException, HttpStatus } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MediaStreamError } from '../errors/media-stream.errors.js'

/** The JSON body every error response carries. */
export interface ErrorResponseBody {
	name: string
	message: string
	status: HttpStatus
	code: string
	timestamp: string
	path: string
	method: string
	correlationId: string | null
}

type ErrorShape = Pick<ErrorResponseBody, 'name' | 'message' | 'status' | 'code'>

/**
 * Global exception filter: every error becomes the same JSON envelope.
 *
 * 5xx are server faults → ERROR log. 4xx are client errors (bad params, an
 * unknown image, a crawler hitting a retired URL shape) → WARN, so the ERROR
 * stream stays reserved for real server-side problems.
 */
@Catch()
export class MediaStreamExceptionFilter implements ExceptionFilter {
	constructor(
		private readonly httpAdapterHost: HttpAdapterHost,
		private readonly correlationService: CorrelationService,
	) {}

	catch(exception: Error, host: ArgumentsHost): void {
		const ctx = host.switchToHttp()
		const response = ctx.getResponse<Response>()
		const request = ctx.getRequest<Request>()

		let shape: ErrorShape
		let logDetail: string

		if (exception instanceof MediaStreamError) {
			shape = exception
			// error.context (e.g. the upstream URL) goes to the log only; exposing
			// it in the response would leak internal topology.
			logDetail = JSON.stringify(exception.toJSON())
		}
		else if (exception instanceof HttpException) {
			const status = exception.getStatus()
			const payload = exception.getResponse()
			shape = {
				name: exception.name,
				message: typeof payload === 'object' && payload !== null && 'message' in payload ? String(payload.message) : exception.message,
				status,
				code: `HTTP_${status}`,
			}
			logDetail = exception.message
		}
		else {
			shape = {
				name: 'InternalServerError',
				message: 'An unexpected error occurred',
				status: HttpStatus.INTERNAL_SERVER_ERROR,
				code: 'INTERNAL_SERVER_ERROR',
			}
			logDetail = exception.stack || exception.message
		}

		const body = this.formatErrorResponse(shape, request)

		if (shape.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
			CorrelatedLogger.error(`${shape.name}: ${exception.message}`, logDetail, MediaStreamExceptionFilter.name)
		}
		else {
			CorrelatedLogger.warn(`${shape.name}: ${exception.message} ${JSON.stringify(body)}`, MediaStreamExceptionFilter.name)
		}

		this.httpAdapterHost.httpAdapter.reply(response, body, shape.status)
	}

	private formatErrorResponse(error: ErrorShape, request: Request): ErrorResponseBody {
		return {
			name: error.name,
			message: error.message,
			status: error.status,
			code: error.code,
			timestamp: new Date().toISOString(),
			path: request.url,
			method: request.method,
			correlationId: this.correlationService.getCorrelationId(),
		}
	}
}
