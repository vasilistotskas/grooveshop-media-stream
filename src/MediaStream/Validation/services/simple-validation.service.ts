import CacheImageRequest from '@microservice/API/dto/cache-image-request.dto'

import { Injectable, Logger } from '@nestjs/common'
import { InputSanitizationService } from './input-sanitization.service'
import { SecurityCheckerService } from './security-checker.service'

export interface SimpleValidationResult {
	isValid: boolean
	errors: string[]
	sanitizedInput?: any
}

@Injectable()
export class SimpleValidationService {
	private readonly _logger = new Logger(SimpleValidationService.name)

	constructor(
		private readonly sanitizationService: InputSanitizationService,
		private readonly securityChecker: SecurityCheckerService,
	) {}

	async validateCacheImageRequest(request: CacheImageRequest): Promise<SimpleValidationResult> {
		const errors: string[] = []

		try {
			const isMalicious = await this.securityChecker.checkForMaliciousContent(request)
			if (isMalicious) {
				errors.push('Request contains potentially malicious content')
				await this.securityChecker.logSecurityEvent({
					type: 'malicious_content',
					source: 'simple_validation_service',
					details: { resourceTarget: request.resourceTarget },
					timestamp: new Date(),
				})
			}

			if (!this.sanitizationService.validateUrl(request.resourceTarget)) {
				errors.push('Invalid or disallowed URL')
			}

			const { width, height } = request.resizeOptions
			if (width && height) {
				if (!this.sanitizationService.validateImageDimensions(width, height)) {
					errors.push('Image dimensions exceed allowed limits')
				}
			}

			const sanitizedInput = await this.sanitizationService.sanitize(request)

			return {
				isValid: errors.length === 0,
				errors,
				sanitizedInput,
			}
		}
		catch (error: unknown) {
			this._logger.error('Validation error', error)
			return {
				isValid: false,
				errors: ['Validation service error'],
			}
		}
	}

	async validateInput(input: any): Promise<SimpleValidationResult> {
		const errors: string[] = []

		try {
			const isMalicious = await this.securityChecker.checkForMaliciousContent(input)
			if (isMalicious) {
				errors.push('Input contains potentially malicious content')
			}

			const sanitizedInput = await this.sanitizationService.sanitize(input)

			return {
				isValid: errors.length === 0,
				errors,
				sanitizedInput,
			}
		}
		catch (error: unknown) {
			this._logger.error('Input validation error', error)
			return {
				isValid: false,
				errors: ['Input validation service error'],
			}
		}
	}
}
