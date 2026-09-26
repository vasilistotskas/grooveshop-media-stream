import type { Request, Response } from 'express'
import type { ProcessedImage } from '#microservice/Cache/operations/image-format-processor.service'
import type ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import type { ImageProcessingContext } from '../types/image-source.types.js'
import { Injectable } from '@nestjs/common'
import UnableToFetchResourceException from '#microservice/API/exceptions/unable-to-fetch-resource.exception'
import CacheImageResourceOperation from '#microservice/Cache/operations/cache-image-resource.operation'
import { CircuitBreakerOpenError, DefaultImageFallbackError, ProcessingOverloadedError, ProcessingTimeoutError, SvgSanitizationError, UnsupportedSourceFormatError, UpstreamResourceTooLargeError } from '#microservice/common/errors/media-stream.errors'
import { getMimeType } from '#microservice/common/utils/content-negotiation.util'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { checkETagMatch, checkIfModifiedSince, formatLastModified, generateWeakETag } from '#microservice/common/utils/etag.util'
import { RequestDeduplicator } from '#microservice/common/utils/request-deduplication.util'
import { currentImageRequest } from '#microservice/Correlation/utils/image-request-log.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { outputFormat } from '#microservice/Processing/jobs/webp-image-manipulation.job'
import CacheImageRequest from '../dto/cache-image-request.dto.js'

/**
 * Build a Cache-Control header value for image responses.
 *
 * Directives:
 *  - `max-age`: browser cache lifetime (seconds).
 *  - `s-maxage`: shared-cache (CDN) lifetime; set equal to max-age because
 *    all responses are content-addressed and `immutable`.
 *  - `public`: explicitly allow shared caches.
 *  - `immutable`: tell the client not to revalidate within the fresh window
 *    (saves a 304 roundtrip — responses won't change for this URL).
 *  - `stale-while-revalidate` (7d): allow caches to serve stale content while
 *    refreshing in the background. Safe because content is immutable.
 *  - `stale-if-error` (30d): serve stale content during origin outages. Buys
 *    the service a long availability tail in front of CDNs.
 *
 * Spec refs: RFC 9111 (Cache-Control), RFC 5861 (stale-while-revalidate,
 * stale-if-error). `immutable` defined in RFC 8246.
 */
function buildCacheControl(publicTTLms: number): string {
	const maxAge = Math.floor((publicTTLms || 0) / 1000)
	return `max-age=${maxAge}, s-maxage=${maxAge}, public, immutable, stale-while-revalidate=604800, stale-if-error=2592000`
}

/**
 * The source was refused by policy, not lost to a fault: over its format's
 * size limit, not a supported format, or an SVG the sanitiser would not
 * vouch for. The request line carries it at WARN; no separate ERROR line.
 */
function isRejectedSource(error: unknown): error is UpstreamResourceTooLargeError | UnsupportedSourceFormatError | SvgSanitizationError {
	return error instanceof UpstreamResourceTooLargeError
		|| error instanceof UnsupportedSourceFormatError
		|| error instanceof SvgSanitizationError
}

function etagFor(metadata: ResourceMetaData): string {
	return generateWeakETag(metadata.size || 0, metadata.dateCreated, metadata.format)
}

/**
 * Serves one image request: cached copy, 304, or fetch + process behind the
 * request deduplicator; any failure serves the default image instead.
 */
@Injectable()
export class ImageStreamService {
	constructor(
		private readonly cacheImageResourceOperation: CacheImageResourceOperation,
		private readonly metricsService: MetricsService,
		private readonly requestDeduplicator: RequestDeduplicator<ProcessedImage>,
	) {}

	/**
	 * Everything that fails in here is answered with the fallback image; only
	 * a failing fallback itself (DefaultImageFallbackError) propagates.
	 */
	async processAndStream(
		context: ImageProcessingContext,
		request: CacheImageRequest,
		res: Response,
		req?: Request,
	): Promise<void> {
		const { correlationId } = context
		const log = currentImageRequest()
		PerformanceTracker.startPhase('image_request_processing')

		try {
			const opCtx = await this.cacheImageResourceOperation.setup(request)

			if (await this.cacheImageResourceOperation.checkResourceExists(opCtx)) {
				const headers = opCtx.metaData
				if (req && headers && this.checkConditionalRequest(req, headers)) {
					if (log) {
						log.cache = opCtx.cacheTier ?? undefined
						log.outcome = 'not_modified'
					}
					this.send304Response(res, headers)
					return
				}

				const cached = await this.cacheImageResourceOperation.loadResource(opCtx)
				if (cached) {
					if (log) {
						log.cache = opCtx.cacheTier ?? undefined
					}
					this.send(res, cached)
					return
				}
				CorrelatedLogger.warn(`Cached resource ${opCtx.id} vanished before it could be read, processing it again`, ImageStreamService.name)
			}

			// Concurrent misses for the same identity share one fetch + process;
			// every waiter streams the shared result. The deduplicator calls
			// `fn` synchronously for the request that leads, never for a waiter.
			let leads = false
			const shared = this.requestDeduplicator.execute(opCtx.id, () => {
				leads = true
				return this.cacheImageResourceOperation.execute(opCtx)
			})
			if (log) {
				log.cache = 'miss'
				log.coalesced = leads ? undefined : true
			}
			this.send(res, await shared)
		}
		catch (error: unknown) {
			await this.handleStreamError(error, request, res, correlationId)
		}
		finally {
			PerformanceTracker.endPhase('image_request_processing')
		}
	}

	/**
	 * Check if resource has been modified (for conditional requests)
	 */
	private checkConditionalRequest(req: Request, headers: ResourceMetaData): boolean {
		const ifNoneMatch = req.headers['if-none-match'] as string | undefined
		const ifModifiedSince = req.headers['if-modified-since'] as string | undefined

		if (ifNoneMatch) {
			return checkETagMatch(ifNoneMatch, etagFor(headers))
		}

		if (ifModifiedSince && headers.dateCreated) {
			return !checkIfModifiedSince(ifModifiedSince, headers.dateCreated)
		}

		return false
	}

	private send304Response(res: Response, headers: ResourceMetaData): void {
		res
			.status(304)
			.header('ETag', etagFor(headers))
			.header('Cache-Control', buildCacheControl(headers.publicTTL || 0))
			.end()

		CorrelatedLogger.debug('Sent 304 Not Modified response', ImageStreamService.name)
	}

	/** Write the caching/validation headers and the image bytes. */
	private send(res: Response, { data, metadata }: ProcessedImage): void {
		const publicTTL = metadata.publicTTL || 0
		const log = currentImageRequest()
		if (log) {
			log.outcome = 'ok'
			log.outputFormat = metadata.format
			log.outputBytes = data.length
		}

		res
			.header('Content-Length', String(data.length))
			.header('Cache-Control', buildCacheControl(publicTTL))
			.header('Expires', new Date(Date.now() + publicTTL).toUTCString())
			.header('ETag', etagFor(metadata))
			.header('Last-Modified', formatLastModified(metadata.dateCreated))
			.header('X-Content-Type-Options', 'nosniff')
			.header('Content-Type', getMimeType(metadata.format))
			.end(data)
	}

	/**
	 * Serve fallback image when primary resource fails
	 * @throws DefaultImageFallbackError when the fallback itself cannot be produced
	 */
	private async serveFallbackImage(request: CacheImageRequest, res: Response, correlationId: string, cause: unknown): Promise<void> {
		try {
			const imageBuffer = await this.cacheImageResourceOperation.optimizeAndServeDefaultImage(request.resizeOptions)
			const format = outputFormat(request.resizeOptions.format)
			const log = currentImageRequest()
			if (log) {
				log.outcome = isRejectedSource(cause) ? 'rejected' : 'fallback'
				log.error = cause instanceof Error ? cause.constructor.name : 'UnknownError'
				log.outputFormat = format
				log.outputBytes = imageBuffer.length
			}
			res.header('Content-Type', getMimeType(format))
			res.send(imageBuffer)
		}
		catch (error: unknown) {
			// The fallback needs a Sharp slot too; no slot, or a pipeline cut
			// by the timeout, is still a capacity answer, not a broken fallback.
			if (error instanceof ProcessingOverloadedError || error instanceof ProcessingTimeoutError) {
				throw error
			}
			CorrelatedLogger.error(`Failed to serve fallback image: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, ImageStreamService.name)
			this.metricsService.recordError('default_image_fallback', 'fallback_error')
			throw new DefaultImageFallbackError('Failed to process image request', { error: errorMessage(error), correlationId })
		}
	}

	private async handleStreamError(error: unknown, request: CacheImageRequest, res: Response, correlationId: string): Promise<void> {
		// Capacity, not content: the source is fine, this pod is not. A 503
		// with Retry-After lets the client and CDN retry instead of caching
		// the default image for a perfectly good URL.
		if (error instanceof ProcessingOverloadedError || error instanceof ProcessingTimeoutError) {
			this.metricsService.recordError('image_request', error.code)
			throw error
		}

		if (error instanceof CircuitBreakerOpenError) {
			CorrelatedLogger.warn('Circuit breaker open, serving fallback', ImageStreamService.name)
			this.metricsService.recordError('image_request', 'circuit_breaker_open')
		}
		else if (isRejectedSource(error)) {
			this.metricsService.recordError('image_request', error.code)
		}
		else if (error instanceof UnableToFetchResourceException) {
			// A missing or unreachable source: FetchResourceResponseJob and
			// ResourceFetcher already logged why, at the level it deserves.
			this.metricsService.recordError('image_request', error.constructor.name)
		}
		else {
			CorrelatedLogger.error(`Error processing image request: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, ImageStreamService.name)
			this.metricsService.recordError('image_request', error instanceof Error ? error.constructor.name : 'UnknownError')
		}

		await this.serveFallbackImage(request, res, correlationId, error)
	}
}
