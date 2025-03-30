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
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import { HttpService } from '@nestjs/axios'
import { Controller, Get, InternalServerErrorException, Logger, Param, Res, Scope } from '@nestjs/common'

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
			throw new Error('Headers object is undefined')
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
				this.logger.debug('Resource exists, attempting to stream.')
				await this.streamResource(request, res)
			}
			else {
				this.logger.debug('Resource does not exist, attempting to fetch or fallback to default.')
				await this.fetchAndStreamResource(request, res)
			}
		}
		catch (error) {
			this.logger.error(`Error while processing the image request: ${error}`)
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
	private async streamResource(request: CacheImageRequest, res: Response): Promise<void> {
		const headers = await this.cacheImageResourceOperation.getHeaders
		if (!headers) {
			this.logger.warn('Resource metadata is missing or invalid.')
			await this.defaultImageFallback(request, res)
			return
		}

		try {
			this.logger.debug(`Checking if res is writable stream: ${typeof res.pipe}`)

			const fd = await open(this.cacheImageResourceOperation.getResourcePath, 'r')
			res = MediaStreamImageRESTController.addHeadersToRequest(res, headers)

			const fileStream = fd.createReadStream()

			if (typeof res.on === 'function') {
				fileStream.pipe(res)

				await new Promise((resolve, reject) => {
					fileStream.on('finish', resolve)
					fileStream.on('error', (error) => {
						this.logger.error(`Stream error: ${error}`)
						reject(error)
					})
				})
			}
			else {
				throw new TypeError('Response object is not a writable stream')
			}
		}
		catch (error) {
			this.logger.error(`Error while streaming resource: ${error}`)
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
				this.logger.warn('Failed to fetch resource or generate headers.')
				await this.defaultImageFallback(request, res)
				return
			}

			const fd = await open(this.cacheImageResourceOperation.getResourcePath, 'r')
			res = MediaStreamImageRESTController.addHeadersToRequest(res, headers)

			const fileStream = fd.createReadStream()

			if (typeof res.on === 'function') {
				fileStream.pipe(res)
			}
			else {
				throw new TypeError('Response object is not a writable stream')
			}
		}
		catch (error) {
			this.logger.error(`Error during resource fetch and stream: ${error}`)
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
			this.logger.error(`Failed to serve default image: ${defaultImageError}`)
			throw new InternalServerErrorException('Failed to process the image request.')
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
