import type { Request, Response } from 'express'
import type { ImageRequestLog } from '#microservice/Correlation/utils/image-request-log.util'
import type { ImageSourceKey } from '../config/image-sources.config.js'
import type { ImageProcessingContext, ImageProcessingParams } from '../types/image-source.types.js'
import { BadRequestException, Controller, Get, NotFoundException, Req, Res } from '@nestjs/common'
import { IMAGE } from '#microservice/common/constants/route-prefixes.constant'
import { PUBLIC_TENANT_SCHEMA } from '#microservice/common/constants/tenant.constant'
import { decodePathFully } from '#microservice/common/utils/percent-decode.util'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import { currentImageRequest } from '#microservice/Correlation/utils/image-request-log.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { IMAGE_SOURCES } from '../config/image-sources.config.js'
import CacheImageRequest, {
	FitOptions,
	ResizeOptions,
	SupportedResizeFormats,
} from '../dto/cache-image-request.dto.js'
import { MAX_LOGGED_PATH_LENGTH, truncateForLog } from '../middleware/image-request-log.middleware.js'
import { ImageStreamService } from '../services/image-stream.service.js'
import { RequestValidatorService } from '../services/request-validator.service.js'
import { UrlBuilderService } from '../services/url-builder.service.js'

const BACKSLASH_RE = /\\/g
const PARAM_PLUS_RE = /:([^/.]+)\+/g
const PARAM_DOT_PARAM_RE = /:([^/.]+)\.([^/.]+)/g
const PARAM_RE = /:([^/]+)/g
const SLASH_RE = /\//g
/** Longest route-param string (fit, position, format, schema) a log line carries. */
const MAX_LOGGED_PARAM_LENGTH = 64

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

		// Percent-decode until stable: TinyMCE-authored URLs arrive double-encoded.
		// Traversal defence lives downstream (SecurityCheckerService multi-decodes
		// every string param) and the strict IMAGE_SOURCES regex rejects anything
		// not shaped like an image path, so decoding here is safe.
		try {
			fullPath = decodePathFully(fullPath)
		}
		catch {
			throw new BadRequestException('Invalid URL encoding in image path')
		}

		CorrelatedLogger.debug(`Processing image request: ${fullPath} (original: ${req.path})`, MediaStreamImageController.name)

		const log = currentImageRequest()
		if (log) {
			log.path = truncateForLog(fullPath, MAX_LOGGED_PATH_LENGTH)
		}

		const match = this.findMatchingSource(fullPath)

		if (!match) {
			// The exception filter logs it at WARN.
			throw new NotFoundException(`No image source matches path: ${fullPath}`)
		}

		const { sourceKey, params } = match
		if (log) {
			this.describeRequest(log, sourceKey, params)
		}

		await this.processImageRequest(sourceKey, params, res, req)
	}

	/**
	 * Find matching image source and extract parameters.
	 *
	 * Patterns are tested in V8 insertion order of the IMAGE_SOURCES object
	 * literal: UPLOADED_MEDIA (``media/:tenantSchema/uploads/:imagePath+/…``)
	 * then STATIC_IMAGES (``static/images/:image/…``). The patterns are
	 * distinct enough that no ambiguity exists between the two.
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
			// Segments are kept verbatim; RequestValidatorService rejects garbage values with a 400.
			params[name] = match[index + 1]
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

			this.requestValidatorService.validateRequest(context)

			const resourceUrl = this.urlBuilderService.buildResourceUrl(context)
			this.requestValidatorService.validateUrl(resourceUrl, correlationId)

			const resizeOptions = this.buildResizeOptions(params)

			// Only the tenant route carries a schema (already validated against
			// TENANT_SCHEMA_PATTERN); shared routes cache under the public tenant.
			const tenantSchema = params.tenantSchema ?? PUBLIC_TENANT_SCHEMA

			const request = new CacheImageRequest({
				resourceTarget: resourceUrl,
				resizeOptions,
				tenantSchema,
			})

			CorrelatedLogger.debug(`Processing ${source.name} request for ${resourceUrl} (params: ${JSON.stringify(params)})`, MediaStreamImageController.name)

			await this.imageStreamService.processAndStream(context, request, res, req)
		}
		catch (error: unknown) {
			// Not logged here: MediaStreamExceptionFilter writes the one line
			// for a thrown error (ERROR for 5xx, WARN for 4xx and capacity
			// sheds), and the image request line carries the params, status
			// and error class. A second line here doubled every 400 at ERROR.
			this.metricsService.recordError(phaseKey, error instanceof Error ? error.constructor.name : 'UnknownError')
			throw error
		}
		finally {
			PerformanceTracker.endPhase(phaseKey)
		}
	}

	/**
	 * Every route segment is mandatory and already validated, so values are
	 * converted verbatim; ResizeOptions supplies defaults only for programmatic
	 * callers that omit a field.
	 */
	private buildResizeOptions(params: ImageProcessingParams): ResizeOptions {
		return new ResizeOptions({
			width: Number(params.width),
			height: Number(params.height),
			position: params.position,
			background: params.background,
			fit: params.fit as FitOptions | undefined,
			trimThreshold: Number(params.trimThreshold),
			format: params.format as SupportedResizeFormats | undefined,
			quality: Number(params.quality),
		})
	}

	/**
	 * Copy the matched route into the request's log record before validation,
	 * so a 400 still says what was asked for. Values are unvalidated here:
	 * strings are capped, and a number that does not parse is left out.
	 */
	private describeRequest(log: ImageRequestLog, sourceKey: ImageSourceKey, params: ImageProcessingParams): void {
		const text = (value: string | undefined): string | undefined => value === undefined ? undefined : truncateForLog(value, MAX_LOGGED_PARAM_LENGTH)
		const number = (value: string | undefined): number | undefined => {
			const parsed = Number(value)
			return value !== undefined && Number.isFinite(parsed) ? parsed : undefined
		}
		log.source = sourceKey
		log.schema = text(params.tenantSchema ?? PUBLIC_TENANT_SCHEMA)
		log.width = number(params.width)
		log.height = number(params.height)
		log.fit = text(params.fit)
		log.position = text(params.position)
		log.format = text(params.format)
		log.quality = number(params.quality)
	}
}
