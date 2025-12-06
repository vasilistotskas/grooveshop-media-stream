import type { ImageProcessingContext } from '../types/image-source.types.js'
import {
	MAX_IMAGE_HEIGHT,
	MAX_IMAGE_WIDTH,
	MAX_QUALITY,
	MAX_TRIM_THRESHOLD,
	MIN_IMAGE_DIMENSION,
	MIN_QUALITY,
	MIN_TRIM_THRESHOLD,
} from '#microservice/common/constants/image-limits.constant'
import { InvalidRequestError } from '#microservice/common/errors/media-stream.errors'
import { InputSanitizationService } from '#microservice/Validation/services/input-sanitization.service'
import { SecurityCheckerService } from '#microservice/Validation/services/security-checker.service'
import { Injectable, Logger } from '@nestjs/common'

/**
 * Validation rules for image processing parameters
 */
interface ValidationRule {
	min?: number
	max?: number
	required?: boolean
	pattern?: RegExp
	/** Allow zero as a special value (e.g., 0 = use original dimensions) */
	allowZero?: boolean
}

const VALIDATION_RULES: Record<string, ValidationRule> = {
	width: { min: MIN_IMAGE_DIMENSION, max: MAX_IMAGE_WIDTH, allowZero: true },
	height: { min: MIN_IMAGE_DIMENSION, max: MAX_IMAGE_HEIGHT, allowZero: true },
	quality: { min: MIN_QUALITY, max: MAX_QUALITY },
	trimThreshold: { min: MIN_TRIM_THRESHOLD, max: MAX_TRIM_THRESHOLD },
}

/**
 * Service responsible for validating image processing requests
 */
@Injectable()
export class RequestValidatorService {
	private readonly _logger = new Logger(RequestValidatorService.name)

	constructor(
		private readonly inputSanitizationService: InputSanitizationService,
		private readonly securityCheckerService: SecurityCheckerService,
	) {}

	/**
	 * Validate all request parameters
	 */
	async validateRequest(context: ImageProcessingContext): Promise<void> {
		const { params, correlationId } = context

		await this.validateSecurityThreats(params, correlationId)

		this.validateNumericParameters(params, correlationId)

		this._logger.debug('Request validation passed', {
			params,
			correlationId,
		})
	}

	/**
	 * Validate URL is safe and well-formed
	 */
	async validateUrl(url: string, correlationId: string): Promise<void> {
		const isValid = this.inputSanitizationService.validateUrl(url)
		if (!isValid) {
			throw new InvalidRequestError('Invalid resource URL', {
				correlationId,
				url,
			})
		}
	}

	/**
	 * Check for malicious content in string parameters
	 */
	private async validateSecurityThreats(params: Record<string, any>, correlationId: string): Promise<void> {
		const stringParams = Object.entries(params).filter(([_, value]) =>
			typeof value === 'string',
		)

		for (const [key, value] of stringParams) {
			const isMalicious = await this.securityCheckerService.checkForMaliciousContent(value as string)
			if (isMalicious) {
				throw new InvalidRequestError(`Invalid ${key} parameter`, {
					correlationId,
					[key]: value,
				})
			}
		}
	}

	/**
	 * Validate numeric parameters against rules
	 */
	private validateNumericParameters(params: Record<string, any>, correlationId: string): void {
		for (const [key, rule] of Object.entries(VALIDATION_RULES)) {
			const value = params[key]

			if (value === null || value === undefined) {
				if (rule.required) {
					throw new InvalidRequestError(`Missing required parameter: ${key}`, {
						correlationId,
						parameter: key,
					})
				}
				continue
			}

			const numValue = Number(value)

			if (Number.isNaN(numValue)) {
				throw new InvalidRequestError(`Invalid ${key} parameter: not a number`, {
					correlationId,
					[key]: value,
				})
			}

			// Skip minimum check if allowZero is true and value is exactly 0
			// 0 is a special value meaning "use original dimensions"
			if (rule.min !== undefined && numValue < rule.min) {
				if (!(rule.allowZero && numValue === 0)) {
					throw new InvalidRequestError(`Invalid ${key} parameter: below minimum ${rule.min}`, {
						correlationId,
						[key]: value,
						min: rule.min,
					})
				}
			}

			if (rule.max !== undefined && numValue > rule.max) {
				throw new InvalidRequestError(`Invalid ${key} parameter: above maximum ${rule.max}`, {
					correlationId,
					[key]: value,
					max: rule.max,
				})
			}
		}
	}
}
