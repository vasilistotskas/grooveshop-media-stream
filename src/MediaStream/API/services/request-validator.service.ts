import type { ImageProcessingContext } from '../types/image-source.types.js'
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
}

const VALIDATION_RULES: Record<string, ValidationRule> = {
	width: { min: 1, max: 5000 },
	height: { min: 1, max: 5000 },
	quality: { min: 1, max: 100 },
	trimThreshold: { min: 0, max: 100 },
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

			if (rule.min !== undefined && numValue < rule.min) {
				throw new InvalidRequestError(`Invalid ${key} parameter: below minimum ${rule.min}`, {
					correlationId,
					[key]: value,
					min: rule.min,
				})
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
