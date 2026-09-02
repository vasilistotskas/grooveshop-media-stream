import type { Metadata } from '../types/common.types.js'
import { HttpStatus } from '@nestjs/common'

/**
 * Base error class for all MediaStream errors
 * Provides additional context for error handling and logging
 */
export class MediaStreamError extends Error {
	public readonly status: HttpStatus
	public readonly code: string
	public readonly context: Metadata

	constructor(
		message: string,
		status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
		code: string = 'MEDIA_STREAM_ERROR',
		context: Metadata = {},
	) {
		super(message)
		this.name = this.constructor.name
		this.status = status
		this.code = code
		this.context = context
		Error.captureStackTrace(this, this.constructor)
	}

	/**
	 * Converts the error to a JSON object for logging and response formatting
	 */
	public toJSON(): Metadata {
		return {
			name: this.name,
			message: this.message,
			status: this.status,
			code: this.code,
			context: this.context,
			stack: this.stack,
		}
	}
}

/**
 * Error thrown when there's an issue with the default image fallback
 */
export class DefaultImageFallbackError extends MediaStreamError {
	constructor(
		message: string = 'Failed to serve default image',
		context: Metadata = {},
	) {
		super(message, HttpStatus.INTERNAL_SERVER_ERROR, 'DEFAULT_IMAGE_FALLBACK_ERROR', context)
	}
}

/**
 * Error thrown when there's an issue with the request parameters
 */
export class InvalidRequestError extends MediaStreamError {
	constructor(
		message: string = 'Invalid request parameters',
		context: Metadata = {},
	) {
		super(message, HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', context)
	}
}

/**
 * The upstream HTTP circuit breaker is open; no request was attempted.
 */
export class CircuitBreakerOpenError extends MediaStreamError {
	constructor(context: Metadata = {}) {
		super('Circuit breaker is open', HttpStatus.SERVICE_UNAVAILABLE, 'CIRCUIT_BREAKER_OPEN', context)
	}
}

/**
 * The upstream resource exceeds the per-format size limit (declared or streamed).
 */
export class UpstreamResourceTooLargeError extends MediaStreamError {
	constructor(
		message: string = 'Upstream resource exceeds the size limit',
		context: Metadata = {},
	) {
		super(message, HttpStatus.BAD_GATEWAY, 'UPSTREAM_RESOURCE_TOO_LARGE', context)
	}
}
