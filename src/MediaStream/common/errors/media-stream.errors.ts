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
 * A tenant flush could not clear every tier (Redis unreachable, a sweep that
 * threw). Answered 503 so the caller, Django's flush task, retries.
 */
export class TenantFlushIncompleteError extends MediaStreamError {
	constructor(context: Metadata = {}) {
		super('Tenant cache flush did not complete', HttpStatus.SERVICE_UNAVAILABLE, 'TENANT_FLUSH_INCOMPLETE', context)
	}
}

/**
 * The store is suspended (Django's tenant feed lists it), so its images are
 * refused before any cache tier is read. 503, like Django's answer to the
 * store's own requests: the store exists and the condition is temporary, so
 * crawlers keep its images indexed rather than dropping them as gone.
 */
export class TenantSuspendedError extends MediaStreamError {
	constructor(context: Metadata = {}) {
		super('This store is temporarily unavailable', HttpStatus.SERVICE_UNAVAILABLE, 'TENANT_SUSPENDED', context)
	}
}

/**
 * Every Sharp pipeline slot is busy and the wait queue is full (or the wait
 * timed out). Answered 503 with Retry-After so clients and CDNs back off
 * instead of receiving the default image for a perfectly good source.
 */
export class ProcessingOverloadedError extends MediaStreamError {
	public readonly retryAfterSeconds: number

	constructor(retryAfterSeconds: number = 2, context: Metadata = {}) {
		super('Image processing capacity exhausted', HttpStatus.SERVICE_UNAVAILABLE, 'PROCESSING_OVERLOADED', context)
		this.retryAfterSeconds = retryAfterSeconds
	}
}

/**
 * Background work (rendition pre-generation) asked for a pipeline slot while a
 * request held or awaited one, and stepped aside. Never reaches a client: it is
 * a {@link ProcessingOverloadedError} only so the pipeline's capacity handling
 * (no error metric, no fallback image) applies to it unchanged.
 */
export class BackgroundYieldError extends ProcessingOverloadedError {}

/**
 * The rendition store (the S3-compatible bucket) is off, failing or too slow.
 * Never reaches a client: a read that hits it is a miss and a write that hits
 * it leaves the image uncached.
 */
export class RenditionStoreUnavailableError extends MediaStreamError {
	constructor(message: string, context: Metadata = {}) {
		super(message, HttpStatus.SERVICE_UNAVAILABLE, 'RENDITION_STORE_UNAVAILABLE', context)
	}
}

/**
 * Sharp aborted a pipeline because it exceeded `processing.timeoutSeconds`.
 */
export class ProcessingTimeoutError extends MediaStreamError {
	constructor(context: Metadata = {}) {
		super('Image processing timed out', HttpStatus.SERVICE_UNAVAILABLE, 'PROCESSING_TIMEOUT', context)
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

/**
 * The upstream bytes are not an image format the pipeline accepts (sniffed
 * from the content, whatever the URL extension says), or an SVG document
 * without an `<svg>` element. Refused before any decoder sees them.
 */
export class UnsupportedSourceFormatError extends MediaStreamError {
	constructor(
		message: string = 'Upstream resource is not a supported image format',
		context: Metadata = {},
	) {
		super(message, HttpStatus.BAD_GATEWAY, 'UNSUPPORTED_SOURCE_FORMAT', context)
	}
}

/**
 * The SVG sanitiser failed closed: its worker errored, ran out of heap, or
 * left a `<script` element behind. The SVG is never served unsanitised.
 */
export class SvgSanitizationError extends MediaStreamError {
	constructor(message: string, context: Metadata = {}) {
		super(message, HttpStatus.BAD_GATEWAY, 'SVG_SANITIZATION_FAILED', context)
	}
}

/**
 * The source was refused by policy, not lost to a fault: over its format's
 * size limit, not a supported format, or an SVG the sanitiser would not
 * vouch for. The request line carries it at WARN; no separate ERROR line.
 */
export function isRejectedSource(error: unknown): error is UpstreamResourceTooLargeError | UnsupportedSourceFormatError | SvgSanitizationError {
	return error instanceof UpstreamResourceTooLargeError
		|| error instanceof UnsupportedSourceFormatError
		|| error instanceof SvgSanitizationError
}
