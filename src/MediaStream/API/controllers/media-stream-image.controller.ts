import type { Request, Response } from 'express'
import type { ImageSourceKey } from '../config/image-sources.config.js'
import type { ImageProcessingContext, ImageProcessingParams } from '../types/image-source.types.js'
import { IMAGE } from '#microservice/common/constants/route-prefixes.constant'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { AdaptiveRateLimitGuard } from '#microservice/RateLimit/guards/adaptive-rate-limit.guard'
import { Controller, Get, Logger, NotFoundException, Req, Res, Scope, UseGuards } from '@nestjs/common'
import { IMAGE_SOURCES } from '../config/image-sources.config.js'
import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	ResizeOptions,
	SupportedResizeFormats,
} from '../dto/cache-image-request.dto.js'
import { ImageStreamService } from '../services/image-stream.service.js'
import { RequestValidatorService } from '../services/request-validator.service.js'
import { UrlBuilderService } from '../services/url-builder.service.js'

/**
 * Controller for image streaming with dynamic route matching
 *
 * This controller uses a catch-all route that matches patterns
 * against IMAGE_SOURCES configuration.
 */
@Controller({
	path: IMAGE,
	scope: Scope.REQUEST,
})
@UseGuards(AdaptiveRateLimitGuard)
export default class MediaStreamImageController {
	private readonly _logger = new Logger(MediaStreamImageController.name)

	constructor(
		private readonly imageStreamService: ImageStreamService,
		private readonly requestValidatorService: RequestValidatorService,
		private readonly urlBuilderService: UrlBuilderService,
		private readonly correlationService: CorrelationService,
		private readonly metricsService: MetricsService,
	) {
		this._logger.log('Image controller initialized with sources:')
		Object.entries(IMAGE_SOURCES).forEach(([key, config]) => {
			this._logger.log(`  - ${key}: /${IMAGE}/${config.routePattern}`)
		})
	}

	/**
	 * Catch-all route handler for all image sources
	 * Matches request path against IMAGE_SOURCES patterns
	 */
	@Get('*')
	public async handleImageRequest(
		@Req() req: Request,
		@Res() res: Response,
	): Promise<void> {
		const correlationId = this.correlationService.getCorrelationId() || 'unknown'

		// Extract the path after the controller base path
		// req.path is like: /media_stream-image/media/uploads/...
		// We need to remove the base path (/{IMAGE}/) to get just the route pattern
		const basePath = `/${IMAGE}/`
		const fullPath = req.path.startsWith(basePath)
			? req.path.substring(basePath.length)
			: req.path

		this._logger.debug('Processing image request', { fullPath, originalPath: req.path, correlationId })

		const match = this.findMatchingSource(fullPath)

		if (!match) {
			this._logger.warn('No matching image source found', { fullPath, correlationId })
			throw new NotFoundException(`No image source matches path: ${fullPath}`)
		}

		const { sourceKey, params } = match

		await this.processImageRequest(sourceKey, params, res)
	}

	/**
	 * Find matching image source and extract parameters
	 */
	private findMatchingSource(path: string): { sourceKey: ImageSourceKey, params: ImageProcessingParams } | null {
		for (const [key, config] of Object.entries(IMAGE_SOURCES)) {
			const params = this.matchPattern(path, config.routePattern, config.routeParams)
			if (params) {
				return { sourceKey: key as ImageSourceKey, params }
			}
		}
		return null
	}

	/**
	 * Match path against pattern and extract parameters
	 */
	private matchPattern(
		path: string,
		pattern: string,
		paramNames: string[],
	): ImageProcessingParams | null {
		// Replace :param with capture groups, handling dots specially
		// :quality.:format becomes ([^/.]+)\.([^/]+) to match "90.webp"
		const regexPattern = pattern
			.replace(/:([^/.]+)\.([^/.]+)/g, '([^/.]+)\\.([^/]+)') // Handle :param1.:param2
			.replace(/:([^/]+)/g, '([^/]+)') // Handle remaining :param
			.replace(/\//g, '\\/') // Escape slashes

		const regex = new RegExp(`^${regexPattern}$`)
		const match = path.match(regex)

		if (!match) {
			return null
		}

		const params: ImageProcessingParams = {}
		paramNames.forEach((name, index) => {
			const value = match[index + 1]
			params[name] = value === 'null' ? null : value
		})

		return params
	}

	/**
	 * Generic handler for processing image requests
	 */
	private async processImageRequest(
		sourceName: ImageSourceKey,
		params: ImageProcessingParams,
		res: Response,
	): Promise<void> {
		const correlationId = this.correlationService.getCorrelationId() || 'unknown'
		const source = IMAGE_SOURCES[sourceName]

		const phaseKey = `${source.name}_request`
		PerformanceTracker.startPhase(phaseKey)

		try {
			const decodedParams = this.decodeParams(params)

			const context: ImageProcessingContext = {
				source,
				params: decodedParams,
				correlationId,
			}

			await this.requestValidatorService.validateRequest(context)

			const resourceUrl = this.urlBuilderService.buildResourceUrl(context)
			await this.requestValidatorService.validateUrl(resourceUrl, correlationId)

			const resizeOptions = this.buildResizeOptions(decodedParams)

			const request = new CacheImageRequest({
				resourceTarget: resourceUrl,
				resizeOptions,
			})

			this._logger.debug('Processing image request', {
				source: source.name,
				params: decodedParams,
				resourceUrl,
				correlationId,
			})

			res.locals.requestedFormat = resizeOptions.format
			res.locals.originalUrl = resourceUrl

			await this.imageStreamService.processAndStream(context, request, res)
		}
		catch (error: unknown) {
			const errorName = error instanceof Error ? error.constructor.name : 'UnknownError'
			this._logger.error(`Error in ${source.name}`, error, { params, correlationId })
			this.metricsService.recordError(phaseKey, errorName)
			throw error
		}
		finally {
			PerformanceTracker.endPhase(phaseKey)
		}
	}

	private decodeParams(params: Record<string, any>): Record<string, any> {
		const decoded: Record<string, any> = {}
		for (const [key, value] of Object.entries(params)) {
			if (typeof value === 'string') {
				try {
					decoded[key] = decodeURIComponent(value)
				}
				catch {
					decoded[key] = value
				}
			}
			else {
				decoded[key] = value
			}
		}
		return decoded
	}

	private buildResizeOptions(params: ImageProcessingParams): ResizeOptions {
		return new ResizeOptions({
			width: params.width ? Number(params.width) : null,
			height: params.height ? Number(params.height) : null,
			position: params.position || PositionOptions.entropy,
			background: params.background || BackgroundOptions.transparent,
			fit: (params.fit as FitOptions) || FitOptions.contain,
			trimThreshold: params.trimThreshold ? Number(params.trimThreshold) : 5,
			format: (params.format as SupportedResizeFormats) || SupportedResizeFormats.webp,
			quality: params.quality ? Number(params.quality) : 80,
		})
	}
}
