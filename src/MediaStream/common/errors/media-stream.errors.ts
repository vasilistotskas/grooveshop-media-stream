import { HttpStatus } from '@nestjs/common'

/**
 * Base error class for all MediaStream errors
 * Provides additional context for error handling and logging
 */
export class MediaStreamError extends Error {
	public readonly status: HttpStatus
	public readonly code: string
	public readonly context: Record<string, any>

	constructor(
		message: string,
		status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
		code: string = 'MEDIA_STREAM_ERROR',
		context: Record<string, any> = {},
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
	public toJSON(): Record<string, any> {
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
 * Error thrown when a resource is not found
 */
export class ResourceNotFoundError extends MediaStreamError {
	constructor(
		message: string = 'Resource not found',
		context: Record<string, any> = {},
	) {
		super(message, HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', context)
	}
}

/**
 * Error thrown when there's an issue with resource processing
 */
export class ResourceProcessingError extends MediaStreamError {
	constructor(
		message: string = 'Failed to process resource',
		context: Record<string, any> = {},
	) {
		super(message, HttpStatus.INTERNAL_SERVER_ERROR, 'RESOURCE_PROCESSING_ERROR', context)
	}
}

/**
 * Error thrown when there's an issue with streaming a resource
 */
export class ResourceStreamingError extends MediaStreamError {
	constructor(
		message: string = 'Failed to stream resource',
		context: Record<string, any> = {},
	) {
		super(message, HttpStatus.INTERNAL_SERVER_ERROR, 'RESOURCE_STREAMING_ERROR', context)
	}
}

/**
 * Error thrown when there's an issue with the default image fallback
 */
export class DefaultImageFallbackError extends MediaStreamError {
	constructor(
		message: string = 'Failed to serve default image',
		context: Record<string, any> = {},
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
		context: Record<string, any> = {},
	) {
		super(message, HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', context)
	}
}
