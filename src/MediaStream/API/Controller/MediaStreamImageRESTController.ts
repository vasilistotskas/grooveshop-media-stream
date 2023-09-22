import { Response } from 'express'
import { createReadStream } from 'fs'
import { HttpService } from '@nestjs/axios'
import { Controller, Get, Param, Res, Scope } from '@nestjs/common'
import ResourceMetaData from '@microservice/DTO/ResourceMetaData'
import { IMAGE, VERSION } from '@microservice/Constant/RoutePrefixes'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	ResizeOptions,
	SupportedResizeFormats
} from '@microservice/API/DTO/CacheImageRequest'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import * as process from 'process'

@Controller({
	path: IMAGE,
	version: VERSION,
	scope: Scope.REQUEST
})
export default class MediaStreamImageRESTController {
	constructor(
		private readonly httpService: HttpService,
		private readonly generateResourceIdentityFromRequestJob: GenerateResourceIdentityFromRequestJob,
		private readonly cacheImageResourceOperation: CacheImageResourceOperation
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
			.header('Content-Length', headers.size)
			.header('Cache-Control', `age=${headers.publicTTL / 1000}, public`)
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
			} catch (e) {
				// ignore failed stream to client for now
			} finally {
				await this.cacheImageResourceOperation.execute()
			}
		} else {
			try {
				await this.cacheImageResourceOperation.execute()
				const headers = this.cacheImageResourceOperation.getHeaders
				res = MediaStreamImageRESTController.addHeadersToRequest(res, headers)
				createReadStream(this.cacheImageResourceOperation.getResourcePath).pipe(res)
			} catch (e) {
				res.status(404).send()
			}
		}
	}

	private static resourceTargetPrepare(resourceTarget: string): string {
		return resourceTarget
	}

	@Get('media/uploads/:imageType/:image/:width?/:height?/:fit?/:position?/:background?/:trimThreshold?/:format?')
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
		@Res() res: Response
	): Promise<void> {
		const resizeOptions = new ResizeOptions({
			width,
			height,
			position,
			background,
			fit,
			trimThreshold,
			format
		})
		const djangoApiUrl = process.env.DJANGO_API_URL || 'http://127.0.0.1:8000'
		const request = new CacheImageRequest({
			resourceTarget: MediaStreamImageRESTController.resourceTargetPrepare(
				`${djangoApiUrl}/media/uploads/${imageType}/${image}`
			),
			resizeOptions: resizeOptions
		})
		await this.streamRequestedResource(request, res)
	}

	@Get('static/images/:image/:width?/:height?/:fit?/:position?/:background?/:trimThreshold?/:format?')
	public async staticImage(
		@Param('image') image: string,
		@Param('width') width: number = null,
		@Param('height') height: number = null,
		@Param('fit') fit: FitOptions = FitOptions.contain,
		@Param('position') position = PositionOptions.entropy,
		@Param('background') background = BackgroundOptions.transparent,
		@Param('trimThreshold') trimThreshold = 5,
		@Param('format') format: SupportedResizeFormats = SupportedResizeFormats.webp,
		@Res() res: Response
	): Promise<void> {
		const djangoApiUrl = process.env.DJANGO_API_URL || 'http://127.0.0.1:8000'
		const request = new CacheImageRequest({
			resourceTarget: MediaStreamImageRESTController.resourceTargetPrepare(`${djangoApiUrl}/static/images/${image}`),
			resizeOptions: new ResizeOptions({
				width,
				height,
				position,
				background,
				fit,
				trimThreshold,
				format
			})
		})
		await this.streamRequestedResource(request, res)
	}

	@Get('nuxt/images/:image/:width?/:height?/:fit?/:position?/:background?/:trimThreshold?/:format?')
	public async publicNuxtImage(
		@Param('image') image: string,
		@Param('width') width: number = null,
		@Param('height') height: number = null,
		@Param('fit') fit: FitOptions = FitOptions.contain,
		@Param('position') position = PositionOptions.entropy,
		@Param('background') background = BackgroundOptions.transparent,
		@Param('trimThreshold') trimThreshold = 5,
		@Param('format') format: SupportedResizeFormats = SupportedResizeFormats.webp,
		@Res() res: Response
	): Promise<void> {
		const nuxtPublicUrl = process.env.NEST_PUBLIC_NUXT_URL || 'http://localhost:3000'

		const request = new CacheImageRequest({
			resourceTarget: MediaStreamImageRESTController.resourceTargetPrepare(`${nuxtPublicUrl}/assets/images/${image}`),
			resizeOptions: new ResizeOptions({
				width,
				height,
				position,
				background,
				fit,
				trimThreshold,
				format
			})
		})
		await this.streamRequestedResource(request, res)
	}
}
