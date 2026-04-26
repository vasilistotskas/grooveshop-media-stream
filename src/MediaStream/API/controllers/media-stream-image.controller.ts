import type { Request, Response } from 'express'
import type { ImageSourceKey } from '../config/image-sources.config.js'
import type { ImageProcessingContext, ImageProcessingParams } from '../types/image-source.types.js'
import { IMAGE } from '#microservice/common/constants/route-prefixes.constant'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { BadRequestException, Controller, Get, Logger, NotFoundException, Req, Res } from '@nestjs/common'
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

const BACKSLASH_RE = /\\/g
const PARAM_PLUS_RE = /:([^/.]+)\+/g
const PARAM_DOT_PARAM_RE = /:([^/.]+)\.([^/.]+)/g
const PARAM_RE = /:([^/]+)/g
const SLASH_RE = /\//g

/**
 * Controller for image streaming with dynamic route matching
 *
 * This controller uses a catch-all route that matches patterns
 * against IMAGE_SOURCES configuration.
 * Note: Controllers are stateless by design, no need for REQUEST scope.
 */
@Controller(IMAGE)
export default class MediaStreamImageController {
	private readonly _logger = new Logger(MediaStreamImageController.name)

	private readonly compiledPatterns = new Map<string, RegExp>()

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

			// Pre-compile regex patterns
			const regex = this.compilePattern(config.routePattern)
			this.compiledPatterns.set(key, regex)
		})
	}

	/**
	 * Catch-all route handler for all image sources
	 * Matches request path against IMAGE_SOURCES patterns
	 */
	@Get('*path')
	public async handleImageRequest(
		@Req() req: Request,
		@Res() res: Response,
	): Promise<void> {
		const correlationId = this.correlationService.getCorrelationId() || 'unknown'

		// Extract the path after the controller base path
		// req.path is like: /media_stream-image/media/uploads/...
		// We need to remove the base path (/{IMAGE}/) to get just the route pattern
		const basePath = `/${IMAGE}/`
		let fullPath = req.path.startsWith(basePath)
			? req.path.substring(basePath.length)
			: req.path

		// Some upstream content (notably TinyMCE-edited blog HTML) ends up
		// with mixed or double-encoded image URLs — e.g. a slash stored as
		// `%2F` and Greek bytes stored as `%25CF%2584`. A single decode
		// pass leaves the inner layer intact, the URL builder re-encodes
		// it again, and the upstream `static-svc` returns 404.
		// Loop-decode until the result is stable, but cap iterations to
		// prevent a pathological input from looping forever. Two passes
		// covers every real case observed in production.
		if (fullPath && fullPath.includes('%')) {
			for (let i = 0; i < 3; i++) {
				try {
					const decoded = decodeURIComponent(fullPath)
					if (decoded === fullPath)
						break
					fullPath = decoded
				}
				catch {
					throw new BadRequestException('Invalid URL encoding in image path')
				}
			}
		}

		this._logger.debug('Processing image request', { fullPath, originalPath: req.path, correlationId })

		const match = this.findMatchingSource(fullPath)

		if (!match) {
			this._logger.warn('No matching image source found', { fullPath, correlationId })
			throw new NotFoundException(`No image source matches path: ${fullPath}`)
		}

		const { sourceKey, params } = match

		await this.processImageRequest(sourceKey, params, res, req)
	}

	/**
	 * Find matching image source and extract parameters
	 */
	private findMatchingSource(path: string): { sourceKey: ImageSourceKey, params: ImageProcessingParams } | null {
		for (const [key, config] of Object.entries(IMAGE_SOURCES)) {
			const regex = this.compiledPatterns.get(key)
			if (!regex)
				continue

			const params = this.matchCompiledPattern(path, regex, config.routeParams)
			if (params) {
				return { sourceKey: key as ImageSourceKey, params }
			}
		}
		return null
	}

	/**
	 * Compile pattern string to RegExp
	 */
	private compilePattern(pattern: string): RegExp {
		// Replace :param with capture groups, handling dots and wildcards specially
		// :imagePath+ captures nested paths like blog/post/main/image.jpg
		// :quality.:format becomes ([^/.]+)\.([^/]+) to match "90.webp"
		const regexPattern = pattern
			.replace(BACKSLASH_RE, '\\\\') // Escape backslashes first
			.replace(PARAM_PLUS_RE, '(.+?)') // Handle :param+ (one or more segments, non-greedy)
			.replace(PARAM_DOT_PARAM_RE, '([^/.]+)\\.([^/]+)') // Handle :param1.:param2
			.replace(PARAM_RE, '([^/]+)') // Handle remaining :param
			.replace(SLASH_RE, '\\/') // Escape slashes

		return new RegExp(`^${regexPattern}$`)
	}

	/**
	 * Match path against pre-compiled regex and extract parameters
	 */
	private matchCompiledPattern(
		path: string,
		regex: RegExp,
		paramNames: string[],
	): ImageProcessingParams | null {
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
		req: Request,
	): Promise<void> {
		const correlationId = this.correlationService.getCorrelationId() || 'unknown'
		const source = IMAGE_SOURCES[sourceName]

		const phaseKey = `${source.name}_request`
		PerformanceTracker.startPhase(phaseKey)

		try {
			// Params are already decoded — fullPath was decoded at line 78 before regex matching
			const context: ImageProcessingContext = {
				source,
				params,
				correlationId,
			}

			await this.requestValidatorService.validateRequest(context)

			const resourceUrl = this.urlBuilderService.buildResourceUrl(context)
			await this.requestValidatorService.validateUrl(resourceUrl, correlationId)

			const resizeOptions = this.buildResizeOptions(params)

			const request = new CacheImageRequest({
				resourceTarget: resourceUrl,
				resizeOptions,
			})

			this._logger.debug('Processing image request', {
				source: source.name,
				params,
				resourceUrl,
				correlationId,
			})

			res.locals.requestedFormat = resizeOptions.format
			res.locals.originalUrl = resourceUrl

			await this.imageStreamService.processAndStream(context, request, res, req)
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
