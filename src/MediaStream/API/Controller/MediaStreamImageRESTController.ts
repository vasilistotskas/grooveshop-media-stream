import type ResourceMetaData from '@microservice/DTO/ResourceMetaData'
import type { Response } from 'express'
import { open } from 'node:fs/promises'
import * as process from 'node:process'
import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	ResizeOptions,
	SupportedResizeFormats,
} from '@microservice/API/DTO/CacheImageRequest'
import { IMAGE, VERSION } from '@microservice/Constant/RoutePrefixes'
import {
	DefaultImageFallbackError,
	InvalidRequestError,
	ResourceStreamingError,
} from '@microservice/Error/MediaStreamErrors'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import { HttpService } from '@nestjs/axios'
import { Controller, Get, Logger, Param, Res, Scope } from '@nestjs/common'

@Controller({
	path: IMAGE,
	version: VERSION,
	scope: Scope.REQUEST,
})
export default class MediaStreamImageRESTController {
	private readonly logger = new Logger(MediaStreamImageRESTController.name)

	constructor(
		private readonly httpService: HttpService,
		private readonly generateResourceIdentityFromRequestJob: GenerateResourceIdentityFromRequestJob,
		private readonly cacheImageResourceOperation: CacheImageResourceOperation,
	) {}

	/**
	 * Adds required headers to the response
	 *
	 * @param res
	 * @param headers
	 * @protected
	 */
	protected static addHeadersToRequest(res: Response, headers: ResourceMetaData): Response {
		if (!headers) {
			throw new InvalidRequestError('Headers object is undefined', { headers })
		}

		const size = headers.size !== undefined ? headers.size.toString() : '0'
		const format = headers.format || 'png'
		const publicTTL = headers.publicTTL || 0
		const expiresAt = Date.now() + publicTTL

		res
			.header('Content-Length', size)
			.header('Cache-Control', `max-age=${publicTTL / 1000}, public`)
			.header('Expires', new Date(expiresAt).toUTCString())

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
		try {
			await this.cacheImageResourceOperation.setup(request)

			if (await this.cacheImageResourceOperation.resourceExists) {
				this.logger.debug('Resource exists, attempting to stream.', { request })
				await this.streamResource(request, res)
			}
			else {
				this.logger.debug('Resource does not exist, attempting to fetch or fallback to default.', { request })
				await this.fetchAndStreamResource(request, res)
			}
		}
		catch (error) {
			const context = { request, error }
			this.logger.error(
				`Error while processing the image request: ${error.message || error}`,
				error,
				context,
			)
			await this.defaultImageFallback(request, res)
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
		let fd = null
		try {
			this.logger.debug(`Streaming file: ${filePath}`, { filePath, headers })
			fd = await open(filePath, 'r')
			res = MediaStreamImageRESTController.addHeadersToRequest(res, headers)

			const fileStream = fd.createReadStream()

			if (typeof res.on === 'function') {
				fileStream.pipe(res)

				await new Promise<void>((resolve, reject) => {
					fileStream.on('end', () => resolve())
					fileStream.on('error', (error) => {
						const context = { filePath, headers, error }
						this.logger.error(`Stream error: ${error.message || error}`, error, context)
						reject(new ResourceStreamingError('Error streaming file', context))
					})
					res.on('close', () => {
						fileStream.destroy()
						resolve()
					})
				})
			}
			else {
				throw new InvalidRequestError('Response object is not a writable stream', { filePath, headers })
			}
		}
		catch (error) {
			if (error.name !== 'ResourceStreamingError') {
				throw new ResourceStreamingError('Failed to stream file', { filePath, error: error.message || error })
			}
			throw error
		}
		finally {
			if (fd) {
				await fd.close().catch((err) => {
					this.logger.error(`Error closing file descriptor: ${err.message || err}`, err, { filePath })
				})
			}
		}
	}

	private async streamResource(request: CacheImageRequest, res: Response): Promise<void> {
		const headers = await this.cacheImageResourceOperation.getHeaders
		if (!headers) {
			this.logger.warn('Resource metadata is missing or invalid.', { request })
			await this.defaultImageFallback(request, res)
			return
		}

		try {
			await this.streamFileToResponse(
				this.cacheImageResourceOperation.getResourcePath,
				headers,
				res,
			)
		}
		catch (error) {
			const context = {
				request,
				resourcePath: this.cacheImageResourceOperation.getResourcePath,
				error: error.message || error,
			}
			this.logger.error(`Error while streaming resource: ${error.message || error}`, error, context)
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
		try {
			await this.cacheImageResourceOperation.execute()
			const headers = await this.cacheImageResourceOperation.getHeaders

			if (!headers) {
				this.logger.warn('Failed to fetch resource or generate headers.', { request })
				await this.defaultImageFallback(request, res)
				return
			}

			await this.streamFileToResponse(
				this.cacheImageResourceOperation.getResourcePath,
				headers,
				res,
			)
		}
		catch (error) {
			const context = {
				request,
				resourcePath: this.cacheImageResourceOperation.getResourcePath,
				error: error.message || error,
			}
			this.logger.error(`Error during resource fetch and stream: ${error.message || error}`, error, context)
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
		try {
			const optimizedDefaultImagePath = await this.cacheImageResourceOperation.optimizeAndServeDefaultImage(
				request.resizeOptions,
			)
			res.sendFile(optimizedDefaultImagePath)
		}
		catch (defaultImageError) {
			const context = {
				request,
				resizeOptions: request.resizeOptions,
				error: defaultImageError.message || defaultImageError,
			}
			this.logger.error(`Failed to serve default image: ${defaultImageError.message || defaultImageError}`, defaultImageError, context)
			throw new DefaultImageFallbackError('Failed to process the image request', context)
		}
	}

	private static resourceTargetPrepare(resourceTarget: string): string {
		return resourceTarget
	}

	@Get(
		'media/uploads/:imageType/:image/:width/:height/:fit/:position/:background/:trimThreshold/:format/:quality',
	)
	public async uploadedImage(
    @Param('imageType') imageType: string,
    @Param('image') image: string,
    @Param('width') width: number = null,
    @Param('height') height: number = null,
    @Param('fit') fit: FitOptions = FitOptions.contain,
    @Param('position') position = PositionOptions.entropy,
    @Param('background') background = BackgroundOptions.transparent,
    @Param('trimThreshold') trimThreshold = 5,
    @Param('format') format: SupportedResizeFormats = SupportedResizeFormats.webp,
    @Param('quality') quality = 100,
    @Res() res: Response,
	): Promise<void> {
		const resizeOptions = new ResizeOptions({
			width,
			height,
			position,
			background,
			fit,
			trimThreshold,
			format,
			quality,
		})

		const djangoApiUrl = process.env.NEST_PUBLIC_DJANGO_URL || 'http://localhost:8000'
		const request = new CacheImageRequest({
			resourceTarget: MediaStreamImageRESTController.resourceTargetPrepare(
				`${djangoApiUrl}/media/uploads/${imageType}/${image}`,
			),
			resizeOptions,
		})

		this.logger.debug(`Request: ${JSON.stringify(request)}`)

		await this.handleStreamOrFallback(request, res)
	}

	@Get('static/images/:image/:width/:height/:fit/:position/:background/:trimThreshold/:format/:quality')
	public async staticImage(
		@Param('image') image: string,
		@Param('width') width: number = null,
		@Param('height') height: number = null,
		@Param('fit') fit: FitOptions = FitOptions.contain,
		@Param('position') position = PositionOptions.entropy,
		@Param('background') background = BackgroundOptions.transparent,
		@Param('trimThreshold') trimThreshold = 5,
		@Param('format') format: SupportedResizeFormats = SupportedResizeFormats.webp,
		@Param('quality') quality = 100,
		@Res() res: Response,
	): Promise<void> {
		const djangoApiUrl = process.env.NEST_PUBLIC_DJANGO_URL || 'http://localhost:8000'
		const request = new CacheImageRequest({
			resourceTarget: MediaStreamImageRESTController.resourceTargetPrepare(`${djangoApiUrl}/static/images/${image}`),
			resizeOptions: new ResizeOptions({
				width,
				height,
				position,
				background,
				fit,
				trimThreshold,
				format,
				quality,
			}),
		})
		await this.handleStreamOrFallback(request, res)
	}
}
