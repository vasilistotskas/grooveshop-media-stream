import type { ImageProcessingContext, ImageProcessingParams } from '../types/image-source.types.js'
import { Injectable } from '@nestjs/common'
import {
	MAX_IMAGE_HEIGHT,
	MAX_IMAGE_WIDTH,
	MAX_QUALITY,
	MAX_TOTAL_PIXELS,
	MAX_TRIM_THRESHOLD,
	MIN_IMAGE_DIMENSION,
	MIN_QUALITY,
	MIN_TRIM_THRESHOLD,
} from '#microservice/common/constants/image-limits.constant'
import { TENANT_SCHEMA_PATTERN } from '#microservice/common/constants/tenant.constant'
import { InvalidRequestError } from '#microservice/common/errors/media-stream.errors'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { ResourceValidationService } from '#microservice/Validation/services/resource-validation.service'
import { SecurityCheckerService } from '#microservice/Validation/services/security-checker.service'
import {
	FitOptions,
	PositionOptions,
	SupportedResizeFormats,
} from '../dto/cache-image-request.dto.js'

interface NumericRule {
	min: number
	max: number
	/** 0 is a special value: "use the original dimension" */
	allowZero?: boolean
}

const NUMERIC_RULES: Record<string, NumericRule> = {
	width: { min: MIN_IMAGE_DIMENSION, max: MAX_IMAGE_WIDTH, allowZero: true },
	height: { min: MIN_IMAGE_DIMENSION, max: MAX_IMAGE_HEIGHT, allowZero: true },
	quality: { min: MIN_QUALITY, max: MAX_QUALITY },
	trimThreshold: { min: MIN_TRIM_THRESHOLD, max: MAX_TRIM_THRESHOLD },
}

const PATTERN_RULES: Record<string, RegExp> = {
	tenantSchema: TENANT_SCHEMA_PATTERN,
}

// Enum-valued resize params: anything Sharp would choke on is a 400 here, not
// a 500 later. `background` is deliberately absent — parseColor() normalises
// arbitrary values to opaque white.
const ENUM_RULES: Record<string, ReadonlySet<string>> = {
	fit: new Set(Object.values(FitOptions)),
	position: new Set(Object.values(PositionOptions)),
	format: new Set(Object.values(SupportedResizeFormats)),
}

/**
 * Validates route parameters before any work is done. Everything here is a
 * client error (400); the pipeline downstream can assume clean input.
 */
@Injectable()
export class RequestValidatorService {
	constructor(
		private readonly resourceValidationService: ResourceValidationService,
		private readonly securityCheckerService: SecurityCheckerService,
	) {}

	validateRequest(context: ImageProcessingContext): void {
		const { params, correlationId } = context

		this.validateSecurityThreats(params, correlationId)
		this.validateStringParameters(params, correlationId)
		this.validateNumericParameters(params, correlationId)

		CorrelatedLogger.debug(`Request validation passed (params: ${JSON.stringify(params)})`, RequestValidatorService.name)
	}

	/** The built upstream URL must be http(s) on an allowed host (SSRF guard). */
	validateUrl(url: string, correlationId: string): void {
		if (!this.resourceValidationService.validateUrl(url)) {
			throw new InvalidRequestError('Invalid resource URL', { correlationId, url })
		}
	}

	private validateSecurityThreats(params: ImageProcessingParams, correlationId: string): void {
		for (const [key, value] of Object.entries(params)) {
			if (typeof value === 'string' && this.securityCheckerService.checkForMaliciousContent(value)) {
				throw new InvalidRequestError(`Invalid ${key} parameter`, { correlationId, [key]: value })
			}
		}
	}

	private validateStringParameters(params: ImageProcessingParams, correlationId: string): void {
		for (const [key, pattern] of Object.entries(PATTERN_RULES)) {
			const value = params[key]
			if (value !== undefined && !pattern.test(value)) {
				throw new InvalidRequestError(`Invalid ${key} parameter: format not allowed`, { correlationId, [key]: value })
			}
		}

		for (const [key, allowed] of Object.entries(ENUM_RULES)) {
			const value = params[key]
			if (value !== undefined && !allowed.has(value)) {
				throw new InvalidRequestError(`Invalid ${key} parameter: not an allowed value`, { correlationId, [key]: value })
			}
		}
	}

	private validateNumericParameters(params: ImageProcessingParams, correlationId: string): void {
		for (const [key, rule] of Object.entries(NUMERIC_RULES)) {
			const value = params[key]
			if (value === undefined) {
				continue
			}

			const numValue = Number(value)
			if (Number.isNaN(numValue)) {
				throw new InvalidRequestError(`Invalid ${key} parameter: not a number`, { correlationId, [key]: value })
			}

			if (numValue < rule.min && !(rule.allowZero && numValue === 0)) {
				throw new InvalidRequestError(`Invalid ${key} parameter: below minimum ${rule.min}`, { correlationId, [key]: value, min: rule.min })
			}

			if (numValue > rule.max) {
				throw new InvalidRequestError(`Invalid ${key} parameter: above maximum ${rule.max}`, { correlationId, [key]: value, max: rule.max })
			}
		}

		// Per-axis limits alone admit 8192×8192; the product must also fit the
		// pixel budget (a 0 axis means "keep original", contributing nothing).
		const width = Number(params.width ?? 0)
		const height = Number(params.height ?? 0)
		if (width * height > MAX_TOTAL_PIXELS) {
			throw new InvalidRequestError(
				`Requested resize target (${width}x${height}) exceeds the maximum of ${MAX_TOTAL_PIXELS} total pixels`,
				{ correlationId, width, height, max: MAX_TOTAL_PIXELS },
			)
		}
	}
}
