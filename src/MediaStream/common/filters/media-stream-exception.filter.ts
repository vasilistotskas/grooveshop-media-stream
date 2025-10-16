import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import type { Request, Response } from 'express'
import { MediaStreamError } from '@microservice/common/errors/media-stream.errors'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { Catch, HttpException, HttpStatus } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'

/**
 * Global exception filter for handling MediaStream errors
 * Converts errors to appropriate HTTP responses with structured error information
 */
@Catch()
export class MediaStreamExceptionFilter implements ExceptionFilter {
	constructor(
		private readonly httpAdapterHost: HttpAdapterHost,
		private readonly _correlationService: CorrelationService,
	) {}

	catch(exception: Error, host: ArgumentsHost): void {
		const { httpAdapter } = this.httpAdapterHost
		const ctx = host.switchToHttp()
		const response = ctx.getResponse<Response>()
		const request = ctx.getRequest<Request>()

		let status: HttpStatus
		let errorResponse: Record<string, any>

		if (exception instanceof MediaStreamError) {
			status = exception.status
			errorResponse = this.formatErrorResponse(exception, request)
			CorrelatedLogger.error(`MediaStream Error: ${exception.message}`, JSON.stringify(exception.toJSON()), MediaStreamExceptionFilter.name)
		}
		else if (exception instanceof HttpException) {
			status = exception.getStatus()
			const exceptionResponse = exception.getResponse()
			const message = typeof exceptionResponse === 'object' && 'message' in exceptionResponse
				? exceptionResponse.message
				: exception.message

			errorResponse = this.formatErrorResponse({
				name: exception.name,
				message,
				status,
				code: `HTTP_${status}`,
				context: {
					path: request.url,
					method: request.method,
				},
			}, request)

			CorrelatedLogger.error(`HTTP Exception: ${exception.message}`, JSON.stringify(errorResponse), MediaStreamExceptionFilter.name)
		}
		else {
			status = HttpStatus.INTERNAL_SERVER_ERROR
			errorResponse = this.formatErrorResponse({
				name: 'InternalServerError',
				message: 'An unexpected error occurred',
				status,
				code: 'INTERNAL_SERVER_ERROR',
				context: {
					path: request.url,
					method: request.method,
				},
			}, request)

			CorrelatedLogger.error(`Unexpected Error: ${exception.message}`, exception.stack || '', MediaStreamExceptionFilter.name)
		}

		httpAdapter.reply(response, errorResponse, status)
	}

	/**
	 * Formats the error response with consistent structure
	 */
	private formatErrorResponse(
		error: MediaStreamError | Record<string, any>,
		request: Request,
	): Record<string, any> {
		const timestamp = new Date().toISOString()
		const path = request.url
		const method = request.method
		const correlationId = this._correlationService.getCorrelationId()

		if (error instanceof MediaStreamError) {
			const { stack, ...errorDetails } = error.toJSON()
			return {
				...errorDetails,
				timestamp,
				path,
				method,
				correlationId,
			}
		}

		return {
			name: error.name,
			message: (error as Error).message,
			code: (error as any).code,
			status: error.status,
			timestamp,
			path,
			method,
			correlationId,
			context: error.context || {},
		}
	}
}
