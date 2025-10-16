import type ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import type { Response } from 'express'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import * as process from 'node:process'
import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	ResizeOptions,
	SupportedResizeFormats,
} from '#microservice/API/dto/cache-image-request.dto'
import CacheImageResourceOperation from '#microservice/Cache/operations/cache-image-resource.operation'
import { IMAGE, VERSION } from '#microservice/common/constants/route-prefixes.constant'
import {
	DefaultImageFallbackError,
	InvalidRequestError,
	ResourceStreamingError,
} from '#microservice/common/errors/media-stream.errors'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { AdaptiveRateLimitGuard } from '#microservice/RateLimit/guards/adaptive-rate-limit.guard'
import { InputSanitizationService } from '#microservice/Validation/services/input-sanitization.service'
import { SecurityCheckerService } from '#microservice/Validation/services/security-checker.service'
import { Controller, Get, Logger, Param, Res, Scope, UseGuards } from '@nestjs/common'

@Controller({
	path: IMAGE,
	version: VERSION,
	scope: Scope.REQUEST,
})
@UseGuards(AdaptiveRateLimitGuard)
export default class MediaStreamImageRESTController {
	private readonly _logger = new Logger(MediaStreamImageRESTController.name)

	constructor(
		private readonly cacheImageResourceOperation: CacheImageResourceOperation,
		private readonly inputSanitizationService: InputSanitizationService,
		private readonly securityCheckerService: SecurityCheckerService,
		private readonly _correlationService: CorrelationService,
		private readonly metricsService: MetricsService,
	) {}

	/**
	 * Validates request parameters using the new validation infrastructure
	 */
	private async validateRequestParameters(params: any): Promise<void> {
		const correlationId = this._correlationService.getCorrelationId()

		if (params.imageType) {
			const isMalicious = await this.securityCheckerService.checkForMaliciousContent(params.imageType)
			if (isMalicious) {
				throw new InvalidRequestError('Invalid imageType parameter', {
					correlationId,
					imageType: params.imageType,
				})
			}
		}
		if (params.image) {
			const isMalicious = await this.securityCheckerService.checkForMaliciousContent(params.image)
			if (isMalicious) {
				throw new InvalidRequestError('Invalid image parameter', {
					correlationId,
					image: params.image,
				})
			}
		}

		if (params.width !== null && params.width !== undefined) {
			const width = Number(params.width)
			if (Number.isNaN(width) || width < 1 || width > 5000) {
				throw new InvalidRequestError('Invalid width parameter', {
					correlationId,
					width: params.width,
				})
			}
		}

		if (params.height !== null && params.height !== undefined) {
			const height = Number(params.height)
			if (Number.isNaN(height) || height < 1 || height > 5000) {
				throw new InvalidRequestError('Invalid height parameter', {
					correlationId,
					height: params.height,
				})
			}
		}

		if (params.quality !== undefined) {
			const quality = Number(params.quality)
			if (Number.isNaN(quality) || quality < 1 || quality > 100) {
				throw new InvalidRequestError('Invalid quality parameter', {
					correlationId,
					quality: params.quality,
				})
			}
		}

		if (params.trimThreshold !== undefined) {
			const trimThreshold = Number(params.trimThreshold)
			if (Number.isNaN(trimThreshold) || trimThreshold < 0 || trimThreshold > 100) {
				throw new InvalidRequestError('Invalid trimThreshold parameter', {
					correlationId,
					trimThreshold: params.trimThreshold,
				})
			}
		}
	}

	/**
	 * Generates an ETag for cache validation
	 */
	private generateETag(input: Buffer | string): string {
		const hash = createHash('md5')
		hash.update(Buffer.isBuffer(input) ? input : Buffer.from(input))
		return `"${hash.digest('hex')}"`
	}

	/**
	 * Adds required headers to the response with correlation ID
	 *
	 * @param res
	 * @param headers
	 * @param etag Optional ETag for cache validation
	 * @protected
	 */
	protected addHeadersToRequest(res: Response, headers: ResourceMetaData, etag?: string): Response {
		if (!headers) {
			const correlationId = this._correlationService.getCorrelationId()
			throw new InvalidRequestError('Headers object is undefined', {
				headers,
				correlationId,
			})
		}

		const size = headers.size !== undefined ? headers.size.toString() : '0'
		const format = headers.format || 'png'
		const publicTTL = headers.publicTTL || 0
		const expiresAt = Date.now() + publicTTL
		const correlationId = this._correlationService.getCorrelationId()

		res
			.header('Content-Length', size)
			.header('Cache-Control', `max-age=${publicTTL / 1000}, public, immutable`)
			.header('Expires', new Date(expiresAt).toUTCString())
			.header('X-Correlation-ID', correlationId || 'unknown')
			.header('Vary', 'Accept-Encoding')

		if (etag) {
			res.header('ETag', etag)
		}

		if (format === 'svg') {
			res.header('Content-Type', 'image/svg+xml')
		}
		else {
			res.header('Content-Type', `image/${format}`)
		}

		return res
	}

	/**
	 * Handles streaming the resource or falling back to the default image.
	 *
	 * @param request
	 * @param res
	 * @protected
	 */
	private async handleStreamOrFallback(request: CacheImageRequest, res: Response): Promise<void> {
		const correlationId = this._correlationService.getCorrelationId()
		PerformanceTracker.startPhase('image_request_processing')

		try {
			this.metricsService.recordError('image_requests', 'total')

			await this.cacheImageResourceOperation.setup(request)

			if (await this.cacheImageResourceOperation.resourceExists) {
				this._logger.debug('Resource exists, attempting to stream.', {
					request,
					correlationId,
				})
				await this.streamResource(request, res)
			}
			else {
				this._logger.debug('Resource does not exist, attempting to fetch or fallback to default.', {
					request,
					correlationId,
				})

				const shouldUseQueue = this.cacheImageResourceOperation.shouldUseBackgroundProcessing
					&& this.cacheImageResourceOperation.shouldUseBackgroundProcessing()

				await this.cacheImageResourceOperation.execute()

				const maxWaitTime = shouldUseQueue ? 15000 : 10000
				const pollInterval = 150
				let waitTime = 0

				while (waitTime < maxWaitTime) {
					if (await this.cacheImageResourceOperation.resourceExists) {
						this._logger.debug('Resource became available after waiting', {
							waitTime,
							correlationId,
						})
						await this.streamResource(request, res)
						return
					}
					await new Promise(resolve => setTimeout(resolve, pollInterval))
					waitTime += pollInterval
				}

				if (waitTime >= maxWaitTime) {
					this._logger.warn('Timeout waiting for resource to be processed', {
						waitTime,
						correlationId,
						wasQueued: shouldUseQueue,
					})
				}

				await this.defaultImageFallback(request, res)
			}
		}
		catch (error: unknown) {
			const context = { request, error, correlationId }

			const errorMessage = (error as Error).message || ''
			if (errorMessage.includes('Circuit breaker is open')) {
				this._logger.warn(
					'Circuit breaker is open, serving fallback immediately',
					context,
				)
				this.metricsService.recordError('image_request', 'circuit_breaker_open')
			}
			else {
				this._logger.error(
					`Error while processing the image request: ${errorMessage}`,
					error,
					context,
				)
				const errorName = error instanceof Error ? error.constructor.name : 'UnknownError'
				this.metricsService.recordError('image_request', errorName)
			}

			await this.defaultImageFallback(request, res)
		}
		finally {
			PerformanceTracker.endPhase('image_request_processing')
		}
	}

	/**
	 * Streams the requested resource if it exists.
	 *
	 * @param request
	 * @param res
	 * @protected
	 */
	/**
	 * Streams a file to the response.
	 *
	 * @param filePath The path to the file to stream
	 * @param headers The headers to add to the response
	 * @param res The response object
	 * @returns A promise that resolves when the file has been streamed
	 * @private
	 */
	private async streamFileToResponse(filePath: string, headers: ResourceMetaData, res: Response): Promise<void> {
		const correlationId = this._correlationService.getCorrelationId()
		PerformanceTracker.startPhase('file_streaming')
		let fd = null as any

		try {
			this._logger.debug(`Streaming file: ${filePath}`, {
				filePath,
				headers,
				correlationId,
			})

			fd = await open(filePath, 'r')
			res = this.addHeadersToRequest(res, headers)

			const fileStream = fd.createReadStream()

			if (typeof res.on === 'function') {
				fileStream.pipe(res)

				await new Promise<void>((resolve, reject) => {
					fileStream.on('end', () => {
						resolve()
					})
					fileStream.on('error', (error: unknown) => {
						const context = { filePath, headers, error, correlationId }
						this._logger.error(`Stream error: ${(error as Error).message || error}`, error, context)
						this.metricsService.recordError('file_stream', 'stream_error')
						reject(new ResourceStreamingError('Error streaming file', context))
					})
					res.on('close', () => {
						fileStream.destroy()
						resolve()
					})
				})
			}
			else {
				throw new InvalidRequestError('Response object is not a writable stream', {
					filePath,
					headers,
					correlationId,
				})
			}
		}
		catch (error: unknown) {
			if ((error as any).name !== 'ResourceStreamingError') {
				throw new ResourceStreamingError('Failed to stream file', {
					filePath,
					error: (error as Error).message || error,
					correlationId,
				})
			}
			throw error
		}
		finally {
			PerformanceTracker.endPhase('file_streaming')

			if (fd) {
				await fd.close().catch((err: unknown) => {
					this._logger.error(`Error closing file descriptor: ${(err as Error).message || err}`, err, {
						filePath,
						correlationId,
					})
				})
			}
		}
	}

	private async streamResource(request: CacheImageRequest, res: Response): Promise<void> {
		const correlationId = this._correlationService.getCorrelationId()
		const headers = await this.cacheImageResourceOperation.getHeaders

		if (!headers) {
			this._logger.warn('Resource metadata is missing or invalid.', {
				request,
				correlationId,
			})
			await this.defaultImageFallback(request, res)
			return
		}

		try {
			const cachedResource = await this.cacheImageResourceOperation.getCachedResource()
			if (cachedResource && cachedResource.data) {
				res = this.addHeadersToRequest(res, headers)

				let imageData: Buffer
				if (typeof cachedResource.data === 'string') {
					imageData = Buffer.from(cachedResource.data, 'base64')
				}
				else if (Buffer.isBuffer(cachedResource.data)) {
					imageData = cachedResource.data
				}
				else if (cachedResource.data && typeof cachedResource.data === 'object' && 'data' in cachedResource.data) {
					imageData = Buffer.from((cachedResource.data as any).data)
				}
				else {
					this._logger.warn('Unexpected data type in cached resource, falling back to file streaming', {
						dataType: typeof cachedResource.data,
						correlationId: this._correlationService.getCorrelationId(),
					})
					await this.streamFileToResponse(
						this.cacheImageResourceOperation.getResourcePath,
						headers,
						res,
					)
					return
				}

				res.end(imageData)
				return
			}

			await this.streamFileToResponse(
				this.cacheImageResourceOperation.getResourcePath,
				headers,
				res,
			)
		}
		catch (error: unknown) {
			const context = {
				request,
				resourcePath: this.cacheImageResourceOperation.getResourcePath,
				error: (error as Error).message || error,
				correlationId,
			}
			this._logger.error(`Error while streaming resource: ${(error as Error).message || error}`, error, context)
			await this.defaultImageFallback(request, res)
		}
		finally {
			await this.cacheImageResourceOperation.execute()
		}
	}

	/**
	 * Fetches the resource, processes it, and streams it.
	 *
	 * @param request
	 * @param res
	 * @protected
	 */
	private async fetchAndStreamResource(request: CacheImageRequest, res: Response): Promise<void> {
		const correlationId = this._correlationService.getCorrelationId()

		try {
			await this.cacheImageResourceOperation.execute()

			if (this.cacheImageResourceOperation.shouldUseBackgroundProcessing && this.cacheImageResourceOperation.shouldUseBackgroundProcessing()) {
				await new Promise(resolve => setTimeout(resolve, 100))
			}

			const headers = await this.cacheImageResourceOperation.getHeaders

			if (!headers) {
				this._logger.warn('Failed to fetch resource or generate headers.', {
					request,
					correlationId,
				})
				await this.defaultImageFallback(request, res)
				return
			}

			const cachedResource = await this.cacheImageResourceOperation.getCachedResource()
			if (cachedResource && cachedResource.data) {
				res = this.addHeadersToRequest(res, headers)
				const imageData = typeof cachedResource.data === 'string'
					? Buffer.from(cachedResource.data, 'base64')
					: cachedResource.data
				res.end(imageData)
				return
			}

			await this.streamFileToResponse(
				this.cacheImageResourceOperation.getResourcePath,
				headers,
				res,
			)
		}
		catch (error: unknown) {
			const context = {
				request,
				resourcePath: this.cacheImageResourceOperation.getResourcePath,
				error: (error as Error).message || error,
				correlationId,
			}
			this._logger.error(`Error during resource fetch and stream: ${(error as Error).message || error}`, error, context)
			await this.defaultImageFallback(request, res)
		}
	}

	/**
	 * Provides a fallback to serve a default image in case of errors or missing resources.
	 *
	 * @param request
	 * @param res
	 * @protected
	 */
	private async defaultImageFallback(request: CacheImageRequest, res: Response): Promise<void> {
		const correlationId = this._correlationService.getCorrelationId()

		try {
			const optimizedDefaultImagePath = await this.cacheImageResourceOperation.optimizeAndServeDefaultImage(
				request.resizeOptions,
			)

			res.header('X-Correlation-ID', correlationId || 'unknown')
			res.sendFile(optimizedDefaultImagePath)
		}
		catch (defaultImageError: unknown) {
			const errorMessage = defaultImageError instanceof Error ? defaultImageError.message : String(defaultImageError)
			const context = {
				request,
				resizeOptions: request.resizeOptions,
				error: errorMessage,
				correlationId,
			}
			this._logger.error(`Failed to serve default image: ${errorMessage}`, defaultImageError, context)
			this.metricsService.recordError('default_image_fallback', 'fallback_error')
			throw new DefaultImageFallbackError('Failed to process the image request', context)
		}
	}

	/**
	 * Prepares the resource target URL by ensuring proper decoding of URL-encoded characters.
	 * This is critical for handling Greek and other non-ASCII characters in filenames.
	 *
	 * @param resourceTarget The raw resource target URL
	 * @returns The properly decoded resource target URL
	 */
	private static resourceTargetPrepare(resourceTarget: string): string {
		try {
			if (resourceTarget.includes('%')) {
				return decodeURIComponent(resourceTarget)
			}
			return resourceTarget
		}
		catch {
			return resourceTarget
		}
	}

	@Get(
		'media/uploads/:imageType/:image/:width/:height/:fit/:position/:background/:trimThreshold/:format/:quality',
	)
	public async uploadedImage(
		@Param('imageType') imageType: string,
		@Param('image') image: string,
		@Param('width') width: number | null = null,
		@Param('height') height: number | null = null,
		@Param('fit') fit: FitOptions = FitOptions.contain,
		@Param('position') position = PositionOptions.entropy,
		@Param('background') background = BackgroundOptions.transparent,
		@Param('trimThreshold') trimThreshold = 5,
		@Param('format') format: SupportedResizeFormats = SupportedResizeFormats.webp,
		@Param('quality') quality = 80,

		@Res() res: Response,
	): Promise<void> {
		const correlationId = this._correlationService.getCorrelationId()
		PerformanceTracker.startPhase('uploaded_image_request')

		try {
			const decodedImageType = decodeURIComponent(imageType)
			const decodedImage = decodeURIComponent(image)

			await this.validateRequestParameters({
				imageType: decodedImageType,
				image: decodedImage,
				width,
				height,
				quality,
				trimThreshold,
			})

			const resizeOptions = new ResizeOptions({
				width: width ? Number(width) : null,
				height: height ? Number(height) : null,
				position,
				background,
				fit,
				trimThreshold: Number(trimThreshold),
				format,
				quality: Number(quality),
			})

			this._logger.debug(`Created ResizeOptions:`, {
				resizeOptions: JSON.stringify(resizeOptions, null, 2),
				correlationId,
			})

			const djangoApiUrl = process.env.NEST_PUBLIC_DJANGO_URL || 'http://localhost:8000'
			const resourceUrl = `${djangoApiUrl}/media/uploads/${decodedImageType}/${decodedImage}`

			const isValidUrl = this.inputSanitizationService.validateUrl(resourceUrl)
			if (!isValidUrl) {
				throw new InvalidRequestError('Invalid resource URL', {
					correlationId,
					resourceUrl,
				})
			}

			const request = new CacheImageRequest({
				resourceTarget: MediaStreamImageRESTController.resourceTargetPrepare(resourceUrl),
				resizeOptions,
			})

			this._logger.debug(`Uploaded image request`, {
				request: {
					imageType: decodedImageType,
					image: decodedImage,
					width,
					height,
					format,
					quality,
				},
				correlationId,
			})

			res.locals.requestedFormat = format
			res.locals.originalUrl = resourceUrl

			await this.handleStreamOrFallback(request, res)
		}
		catch (error: unknown) {
			const context = {
				imageType,
				image,
				width,
				height,
				format,
				quality,
				correlationId,
				error: (error as Error).message || error,
			}
			this._logger.error(`Error in uploadedImage: ${(error as Error).message || error}`, error, context)
			const errorName = error instanceof Error ? error.constructor.name : 'UnknownError'
			this.metricsService.recordError('uploaded_image_request', errorName)
			throw error
		}
		finally {
			PerformanceTracker.endPhase('uploaded_image_request')
		}
	}

	@Get('static/images/:image/:width/:height/:fit/:position/:background/:trimThreshold/:format/:quality')
	public async staticImage(
		@Param('image') image: string,
		@Param('width') width: number | null = null,
		@Param('height') height: number | null = null,
		@Param('fit') fit: FitOptions = FitOptions.contain,
		@Param('position') position = PositionOptions.entropy,
		@Param('background') background = BackgroundOptions.transparent,
		@Param('trimThreshold') trimThreshold = 5,
		@Param('format') format: SupportedResizeFormats = SupportedResizeFormats.webp,
		@Param('quality') quality = 80,

		@Res() res: Response,
	): Promise<void> {
		const correlationId = this._correlationService.getCorrelationId()
		PerformanceTracker.startPhase('static_image_request')

		try {
			const decodedImage = decodeURIComponent(image)

			await this.validateRequestParameters({
				image: decodedImage,
				width,
				height,
				quality,
				trimThreshold,
			})

			const djangoApiUrl = process.env.NEST_PUBLIC_DJANGO_URL || 'http://localhost:8000'
			const resourceUrl = `${djangoApiUrl}/static/images/${decodedImage}`

			const isValidUrl = this.inputSanitizationService.validateUrl(resourceUrl)
			if (!isValidUrl) {
				throw new InvalidRequestError('Invalid resource URL', {
					correlationId,
					resourceUrl,
				})
			}

			const request = new CacheImageRequest({
				resourceTarget: MediaStreamImageRESTController.resourceTargetPrepare(resourceUrl),
				resizeOptions: new ResizeOptions({
					width: width ? Number(width) : null,
					height: height ? Number(height) : null,
					position,
					background,
					fit,
					trimThreshold: Number(trimThreshold),
					format,
					quality: Number(quality),
				}),
			})

			this._logger.debug(`Static image request`, {
				request: {
					image: decodedImage,
					width,
					height,
					format,
					quality,
				},
				correlationId,
			})

			res.locals.requestedFormat = format
			res.locals.originalUrl = resourceUrl

			await this.handleStreamOrFallback(request, res)
		}
		catch (error: unknown) {
			const context = {
				image,
				width,
				height,
				format,
				quality,
				correlationId,
				error: (error as Error).message || error,
			}
			this._logger.error(`Error in staticImage: ${(error as Error).message || error}`, error, context)
			const errorName = error instanceof Error ? error.constructor.name : 'UnknownError'
			this.metricsService.recordError('static_image_request', errorName)
			throw error
		}
		finally {
			PerformanceTracker.endPhase('static_image_request')
		}
	}
}
