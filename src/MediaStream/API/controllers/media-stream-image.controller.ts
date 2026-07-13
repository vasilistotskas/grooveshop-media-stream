import type { Request, Response } from 'express'
import type { ImageSourceKey } from '../config/image-sources.config.js'
import type { ImageProcessingContext, ImageProcessingParams } from '../types/image-source.types.js'
import { BadRequestException, Controller, Get, NotFoundException, Req, Res } from '@nestjs/common'
import { IMAGE } from '#microservice/common/constants/route-prefixes.constant'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
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
	private readonly compiledPatterns = new Map<string, RegExp>()

	constructor(
		private readonly imageStreamService: ImageStreamService,
		private readonly requestValidatorService: RequestValidatorService,
		private readonly urlBuilderService: UrlBuilderService,
		private readonly correlationService: CorrelationService,
		private readonly metricsService: MetricsService,
	) {
		CorrelatedLogger.log('Image controller initialized with sources:', MediaStreamImageController.name)
		Object.entries(IMAGE_SOURCES).forEach(([key, config]) => {
			CorrelatedLogger.log(`  - ${key}: /${IMAGE}/${config.routePattern}`, MediaStreamImageController.name)

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
		// Extract the path after the controller base path
		// req.path is like: /media_stream-image/media/uploads/...
		// We need to remove the base path (/{IMAGE}/) to get just the route pattern
		const basePath = `/${IMAGE}/`
		let fullPath = req.path.startsWith(basePath)
			? req.path.substring(basePath.length)
			: req.path

		// Loop-decode percent-encoding until stable, capped at 3 passes.
		//
		// TinyMCE-edited blog HTML stores image URLs with inconsistent
		// percent-encoding — the slash sometimes ends up as ``%2F`` and Greek
		// bytes as ``%25CF%2584`` (double-encoded). Single-pass decoding
		// leaves the inner layer intact, the URL builder re-encodes it, and
		// the upstream returns 404 with a confusing "Double-encoded URL
		// detected" or "No matching image source" rejection (verified
		// 2026-05-16: 34 × C19 rejections + 42 × no-source-found on legit
		// blog covers in 24h).
		//
		// Security: this looks like the C19 evasion (multi-decode bypass)
		// it isn't, because path-traversal defence lives downstream of
		// here — ``RequestValidatorService.validateRequest`` runs
		// ``SecurityCheckerService.checkForMaliciousContent`` on every
		// string param including ``imagePath``, and that service's
		// ``containsPathTraversal`` already multi-decodes (single + double)
		// and tests every traversal pattern (``../``, ``%2e%2e%2f`` etc.)
		// against each decoded variant. Additionally, the strict
		// IMAGE_SOURCES regex (``media/uploads/:imagePath+/:width/.../...``)
		// rejects anything not shaped like a legitimate image path.
		//
		// A pathological input that never stabilises within 3 passes falls
		// through still containing ``%`` — the regex won't match and the
		// request 404s, which is the right outcome.
		const MAX_DECODE_PASSES = 3
		if (fullPath && fullPath.includes('%')) {
			for (let i = 0; i < MAX_DECODE_PASSES; i++) {
				let decoded: string
				try {
					decoded = decodeURIComponent(fullPath)
				}
				catch {
					throw new BadRequestException('Invalid URL encoding in image path')
				}
				if (decoded === fullPath) {
					break
				}
				fullPath = decoded
			}
		}

		CorrelatedLogger.debug(`Processing image request: ${fullPath} (original: ${req.path})`, MediaStreamImageController.name)

		const match = this.findMatchingSource(fullPath)

		if (!match) {
			CorrelatedLogger.warn(`No matching image source found: ${fullPath}`, MediaStreamImageController.name)
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

			CorrelatedLogger.debug(`Processing ${source.name} request for ${resourceUrl} (params: ${JSON.stringify(params)})`, MediaStreamImageController.name)

			res.locals.requestedFormat = resizeOptions.format
			res.locals.originalUrl = resourceUrl

			await this.imageStreamService.processAndStream(context, request, res, req)
		}
		catch (error: unknown) {
			const errorName = error instanceof Error ? error.constructor.name : 'UnknownError'
			CorrelatedLogger.error(
				`Error in ${source.name} (params: ${JSON.stringify(params)}): ${(error as Error).message}`,
				error instanceof Error ? error.stack : undefined,
				MediaStreamImageController.name,
			)
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
