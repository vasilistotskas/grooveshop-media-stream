import type { OperationContext } from '#microservice/Cache/operations/cache-image-resource.operation'
import type ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import type { Request, Response } from 'express'
import type { ImageProcessingContext } from '../types/image-source.types.js'
import { Buffer } from 'node:buffer'
import { open } from 'node:fs/promises'
import CacheImageResourceOperation from '#microservice/Cache/operations/cache-image-resource.operation'
import { DefaultImageFallbackError, InvalidRequestError, ResourceStreamingError } from '#microservice/common/errors/media-stream.errors'
import { getMimeType, getVaryHeader, negotiateImageFormat } from '#microservice/common/utils/content-negotiation.util'
import { checkETagMatch, checkIfModifiedSince, formatLastModified, generateWeakETag } from '#microservice/common/utils/etag.util'
import { imageProcessingDeduplicator } from '#microservice/common/utils/request-deduplication.util'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Injectable, Logger } from '@nestjs/common'
import CacheImageRequest from '../dto/cache-image-request.dto.js'

/**
 * Service responsible for streaming images and handling fallbacks
 */
@Injectable()
export class ImageStreamService {
	private readonly _logger = new Logger(ImageStreamService.name)
	private readonly REQUEST_TIMEOUT = 30000 // 30 seconds

	constructor(
		private readonly cacheImageResourceOperation: CacheImageResourceOperation,
		private readonly metricsService: MetricsService,
	) {}

	/**
	 * Main entry point for processing and streaming images
	 * Supports content negotiation, ETag caching, and request deduplication
	 */
	async processAndStream(
		context: ImageProcessingContext,
		request: CacheImageRequest,
		res: Response,
		req?: Request,
	): Promise<void> {
		const { correlationId } = context
		PerformanceTracker.startPhase('image_request_processing')

		// Apply content negotiation if request is available
		if (req && request.resizeOptions) {
			const negotiated = negotiateImageFormat(req, request.resizeOptions.format, request.resizeOptions.quality)
			request.resizeOptions.format = negotiated.format
			request.resizeOptions.quality = negotiated.quality
		}

		try {
			this.metricsService.incrementCounter('image_requests_total')

			// Setup returns the operation context - this is the key change for thread safety
			const opCtx = await this.cacheImageResourceOperation.setup(request)

			// Fast path for cached images (no deduplication overhead)
			if (await this.cacheImageResourceOperation.checkResourceExists(opCtx)) {
				// Check for conditional request (ETag/If-Modified-Since)
				if (req) {
					const headers = await this.cacheImageResourceOperation.fetchHeaders(opCtx)
					if (headers) {
						const notModified = this.checkConditionalRequest(req, headers)
						if (notModified) {
							this.send304Response(res, headers, correlationId)
							return
						}
					}
				}
				await this.streamResource(opCtx, request, res, correlationId)
				return
			}

			// Only deduplicate for non-cached images
			const resourcePath = this.cacheImageResourceOperation.getResourcePath(opCtx)
			await imageProcessingDeduplicator.execute(resourcePath, async () => {
				await this.fetchAndWaitForResource(opCtx, request, res, correlationId)
			})
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
			const etag = generateWeakETag(headers.size || 0, headers.dateCreated, headers.format)
			return checkETagMatch(ifNoneMatch, etag)
		}

		if (ifModifiedSince && headers.dateCreated) {
			return !checkIfModifiedSince(ifModifiedSince, headers.dateCreated)
		}

		return false
	}

	/**
	 * Send 304 Not Modified response
	 */
	private send304Response(res: Response, headers: ResourceMetaData, correlationId: string): void {
		const etag = generateWeakETag(headers.size || 0, headers.dateCreated, headers.format)

		res
			.status(304)
			.header('ETag', etag)
			.header('Cache-Control', `max-age=${(headers.publicTTL || 0) / 1000}, public, immutable`)
			.header('X-Correlation-ID', correlationId)
			.header('Vary', getVaryHeader())
			.end()

		this._logger.debug('Sent 304 Not Modified response', { correlationId })
	}

	/**
	 * Fetch resource and wait for processing to complete
	 */
	private async fetchAndWaitForResource(
		opCtx: OperationContext,
		request: CacheImageRequest,
		res: Response,
		correlationId: string,
	): Promise<void> {
		this._logger.debug('Resource does not exist, processing image', { correlationId })

		try {
			// Process image and wait for completion (fast: 50-200ms)
			await this.cacheImageResourceOperation.execute(opCtx)

			// Image processed successfully, stream it
			await this.streamResource(opCtx, request, res, correlationId)
		}
		catch (error) {
			// Processing failed, serve fallback
			this._logger.warn('Image processing failed, serving fallback', { error, correlationId })
			this.metricsService.recordError('image_processing', 'processing_failed')
			await this.serveFallbackImage(request, res, correlationId)
		}
	}

	/**
	 * Stream the resource to the response
	 */
	private async streamResource(
		opCtx: OperationContext,
		request: CacheImageRequest,
		res: Response,
		correlationId: string,
	): Promise<void> {
		const headers = await this.cacheImageResourceOperation.fetchHeaders(opCtx)

		if (!headers) {
			this._logger.warn('Resource metadata missing', { correlationId })
			await this.serveFallbackImage(request, res, correlationId)
			return
		}

		try {
			const cachedResource = await this.cacheImageResourceOperation.getCachedResource(opCtx)
			if (cachedResource?.data) {
				await this.streamFromMemory(cachedResource.data, headers, res, correlationId, opCtx)
			}
			else {
				await this.streamFromFile(opCtx, headers, res, correlationId)
			}
		}
		catch (error: unknown) {
			this._logger.error('Error streaming resource', error, { correlationId })
			await this.serveFallbackImage(request, res, correlationId)
		}
	}

	/**
	 * Stream image data from memory cache
	 */
	private async streamFromMemory(
		data: any,
		headers: ResourceMetaData,
		res: Response,
		correlationId: string,
		opCtx: OperationContext,
	): Promise<void> {
		this.addHeadersToResponse(res, headers, correlationId)

		let imageData: Buffer
		if (typeof data === 'string') {
			imageData = Buffer.from(data, 'base64')
		}
		else if (Buffer.isBuffer(data)) {
			imageData = data
		}
		else if (data && typeof data === 'object' && 'data' in data) {
			imageData = Buffer.from((data as any).data)
		}
		else {
			this._logger.warn('Unexpected data type, falling back to file', { correlationId })
			await this.streamFromFile(opCtx, headers, res, correlationId)
			return
		}

		res.end(imageData)
	}

	/**
	 * Stream image from file system
	 * Properly handles file descriptor cleanup even on client disconnect
	 */
	private async streamFromFile(
		opCtx: OperationContext,
		headers: ResourceMetaData,
		res: Response,
		correlationId: string,
	): Promise<void> {
		const filePath = this.cacheImageResourceOperation.getResourcePath(opCtx)
		PerformanceTracker.startPhase('file_streaming')
		let fd = null as any
		let streamClosed = false

		try {
			this._logger.debug('Streaming file', { filePath, correlationId })
			fd = await open(filePath, 'r')
			this.addHeadersToResponse(res, headers, correlationId)

			const fileStream = fd.createReadStream()

			if (typeof res.on !== 'function') {
				throw new InvalidRequestError('Response is not a writable stream', { filePath, correlationId })
			}

			fileStream.pipe(res)

			await new Promise<void>((resolve, reject) => {
				const cleanup: () => void = () => {
					if (!streamClosed) {
						streamClosed = true
						fileStream.destroy()
					}
				}

				fileStream.on('end', () => {
					cleanup()
					resolve()
				})
				fileStream.on('error', (error: unknown) => {
					cleanup()
					this._logger.error('Stream error', error, { filePath, correlationId })
					this.metricsService.recordError('file_stream', 'stream_error')
					reject(new ResourceStreamingError('Error streaming file', { filePath, error, correlationId }))
				})
				// Handle client disconnect - cleanup but don't reject (not an error)
				res.on('close', () => {
					cleanup()
					resolve()
				})
			})
		}
		finally {
			PerformanceTracker.endPhase('file_streaming')
			if (fd) {
				await fd.close().catch((err: unknown) => {
					this._logger.error('Error closing file descriptor', err, { filePath, correlationId })
				})
			}
		}
	}

	/**
	 * Serve fallback image when primary resource fails
	 */
	private async serveFallbackImage(
		request: CacheImageRequest,
		res: Response,
		correlationId: string,
	): Promise<void> {
		try {
			const optimizedPath = await this.cacheImageResourceOperation.optimizeAndServeDefaultImage(
				request.resizeOptions,
			)
			res.header('X-Correlation-ID', correlationId)
			res.sendFile(optimizedPath)
		}
		catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			this._logger.error('Failed to serve fallback image', error, { correlationId })
			this.metricsService.recordError('default_image_fallback', 'fallback_error')
			throw new DefaultImageFallbackError('Failed to process image request', { error: errorMessage, correlationId })
		}
	}

	/**
	 * Handle streaming errors
	 */
	private async handleStreamError(
		error: unknown,
		request: CacheImageRequest,
		res: Response,
		correlationId: string,
	): Promise<void> {
		const errorMessage = (error as Error).message || ''

		if (errorMessage.includes('Circuit breaker is open')) {
			this._logger.warn('Circuit breaker open, serving fallback', { correlationId })
			this.metricsService.recordError('image_request', 'circuit_breaker_open')
		}
		else {
			this._logger.error('Error processing image request', error, { correlationId })
			const errorName = error instanceof Error ? error.constructor.name : 'UnknownError'
			this.metricsService.recordError('image_request', errorName)
		}

		await this.serveFallbackImage(request, res, correlationId)
	}

	/**
	 * Add required headers to response including ETag for caching
	 */
	private addHeadersToResponse(
		res: Response,
		headers: ResourceMetaData,
		correlationId: string,
	): void {
		if (!headers) {
			throw new InvalidRequestError('Headers object is undefined', { correlationId })
		}

		const size = headers.size?.toString() || '0'
		const format = headers.format || 'png'
		const publicTTL = headers.publicTTL || 0
		const expiresAt = Date.now() + publicTTL

		// Generate ETag for conditional requests
		const etag = generateWeakETag(size, headers.dateCreated, format)

		res
			.header('Content-Length', size)
			.header('Cache-Control', `max-age=${publicTTL / 1000}, public, immutable`)
			.header('Expires', new Date(expiresAt).toUTCString())
			.header('X-Correlation-ID', correlationId)
			// ETag for conditional requests (304 Not Modified)
			.header('ETag', etag)
			// Last-Modified for conditional requests
			.header('Last-Modified', formatLastModified(headers.dateCreated))
			// Vary on Accept for proper CDN caching with content negotiation (WebP/AVIF support)
			.header('Vary', getVaryHeader())
			// Prevent MIME type sniffing for security
			.header('X-Content-Type-Options', 'nosniff')
			.header('Content-Type', getMimeType(format))
	}
}
