import { createReadStream } from 'node:fs'
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
import type ResourceMetaData from '@microservice/DTO/ResourceMetaData'
import type { Response } from 'express'

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
		const expiresAt = Date.now() + headers.publicTTL
		return res
			.header('Content-Type', `image/${headers.format}`)
			.header('Content-Length', headers.size.toString())
			.header('Cache-Control', `max-age=${headers.publicTTL / 1000}, public`)
			.header('Expires', new Date(expiresAt).toUTCString())
	}

	/**
	 * Streams the resource from the cacheImageResourceOperation
	 *
	 * @param request
	 * @param res
	 * @protected
	 */
	private async streamRequestedResource(request: CacheImageRequest, res: Response): Promise<void> {
		await this.cacheImageResourceOperation.setup(request)
		if (this.cacheImageResourceOperation.resourceExists) {
			const headers = this.cacheImageResourceOperation.getHeaders
			res = MediaStreamImageRESTController.addHeadersToRequest(res, headers)
			const stream = createReadStream(this.cacheImageResourceOperation.getResourcePath).pipe(res)
			try {
				await new Promise((resolve, reject) => {
					stream.on('finish', () => resolve)
					stream.on('error', () => reject)
				})
			}
			catch (e) {
				// ignore failed stream to client for now
				this.logger.error(e)
			}
			finally {
				await this.cacheImageResourceOperation.execute()
			}
		}
		else {
			try {
				await this.cacheImageResourceOperation.execute()
				const headers = this.cacheImageResourceOperation.getHeaders
				res = MediaStreamImageRESTController.addHeadersToRequest(res, headers)
				createReadStream(this.cacheImageResourceOperation.getResourcePath).pipe(res)
			}
			catch (e) {
				this.logger.warn(e)
				await this.defaultImageFallback(request, res)
			}
		}
	}

	private async defaultImageFallback(request: CacheImageRequest, res: Response): Promise<void> {
		try {
			const optimizedDefaultImagePath = await this.cacheImageResourceOperation.optimizeAndServeDefaultImage(
				request.resizeOptions,
			)
			res.sendFile(optimizedDefaultImagePath)
		}
		catch (defaultImageError) {
			this.logger.error('Failed to serve default image', defaultImageError)
			throw new InternalServerErrorException('Failed to process the image request.')
		}
	}

	private static resourceTargetPrepare(resourceTarget: string): string {
		return resourceTarget
	}

	@Get(
		'media/uploads/:imageType/:image/:width?/:height?/:fit?/:position?/:background?/:trimThreshold?/:format?/:quality?',
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
		await this.streamRequestedResource(request, res)
	}

	@Get('static/images/:image/:width?/:height?/:fit?/:position?/:background?/:trimThreshold?/:format?/:quality?')
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
		await this.streamRequestedResource(request, res)
	}

	@Get('img/:image/:width?/:height?/:fit?/:position?/:background?/:trimThreshold?/:format?/:quality?')
	public async publicNuxtImage(
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
		const nuxtPublicUrl = process.env.NEST_PUBLIC_NUXT_URL || 'http://localhost:3000'

		const request = new CacheImageRequest({
			resourceTarget: MediaStreamImageRESTController.resourceTargetPrepare(`${nuxtPublicUrl}/img/${image}`),
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
		await this.streamRequestedResource(request, res)
	}
}
