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
 * Error thrown when a resource is not found
 */
export class ResourceNotFoundError extends MediaStreamError {
	constructor(
		message: string = 'Resource not found',
		context: Metadata = {},
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
		context: Metadata = {},
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
		context: Metadata = {},
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
