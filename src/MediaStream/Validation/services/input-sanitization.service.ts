import type { ISanitizer } from '../interfaces/validator.interface.js'
import {
	MAX_FILE_SIZES,
	MAX_IMAGE_HEIGHT,
	MAX_IMAGE_WIDTH,
	MAX_STRING_LENGTH,
	MAX_TOTAL_PIXELS,
} from '#microservice/common/constants/image-limits.constant'
import { ConfigService } from '#microservice/Config/config.service'
import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class InputSanitizationService implements ISanitizer<any> {
	private readonly _logger = new Logger(InputSanitizationService.name)
	private allowedDomains: string[] | null = null as any

	constructor(private readonly _configService: ConfigService) {
	}

	private getAllowedDomains(): string[] {
		if (this.allowedDomains === null) {
			this.allowedDomains = this._configService.getOptional<string[]>('validation.allowedDomains', [
				'localhost',
				'127.0.0.1',
				'backend-service',
				'webside.gr',
				'assets.webside.gr',
				'api.webside.gr',
				'static.webside.gr',
				'static-svc',
				'frontend-nuxt-service',
				'media-stream-service',
			])
		}
		return this.allowedDomains
	}

	async sanitize(input: any): Promise<any> {
		if (input === null || input === undefined) {
			return input
		}

		if (typeof input === 'string') {
			return this.sanitizeString(input)
		}

		if (Array.isArray(input)) {
			const sanitizedArray = []
			for (let i = 0; i < input.length; i++) {
				sanitizedArray[i] = await this.sanitize(input[i])
			}
			return sanitizedArray
		}

		if (typeof input === 'object') {
			return this.sanitizeObject(input)
		}

		return input
	}

	private sanitizeString(str: string): string {
		const lowerStr = str.toLowerCase()
		const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:', 'about:']
		for (const protocol of dangerousProtocols) {
			if (lowerStr.startsWith(protocol)) {
				return ''
			}
		}

		const emptyStringPatterns = [
			/^\s*on\w+\s*=.*$/i,
			/^\s*javascript\s*:.*$/i,
			/^\s*vbscript\s*:.*$/i,
			/^\s*data\s*:.*$/i,
		]

		for (const pattern of emptyStringPatterns) {
			if (pattern.test(str)) {
				this._logger.warn(`Standalone dangerous pattern detected, returning empty string`)
				return ''
			}
		}

		let sanitized = str
		let previousLength = 0
		let iterations = 0
		const maxIterations = 10

		while (sanitized.length !== previousLength && iterations < maxIterations) {
			previousLength = sanitized.length
			iterations++

			sanitized = this.performSanitizationPass(sanitized)
		}

		sanitized = sanitized.trim()

		if (sanitized.length > MAX_STRING_LENGTH) {
			sanitized = sanitized.substring(0, MAX_STRING_LENGTH)
			this._logger.warn(`String truncated to ${MAX_STRING_LENGTH} characters for security`)
		}

		return sanitized
	}

	private performSanitizationPass(input: string): string {
		let result = input
		result = this.removeHtmlTags(result)
		result = this.removeEventHandlers(result)
		result = this.removeStyleAttributes(result)
		result = this.removeDangerousProtocols(result)
		result = this.removeDangerousJavaScript(result)
		result = this.removeHtmlEntities(result)
		return result
	}

	private async sanitizeObject(obj: any): Promise<any> {
		const sanitized: any = {}

		for (const [key, value] of Object.entries(obj)) {
			const sanitizedKey = this.sanitizeString(String(key))

			sanitized[sanitizedKey] = await this.sanitize(value)
		}

		return sanitized
	}

	validateUrl(url: string): boolean {
		try {
			const lowerUrl = url.toLowerCase().trim()
			const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:', 'about:']
			for (const protocol of dangerousProtocols) {
				if (lowerUrl.startsWith(protocol)) {
					this._logger.warn(`Dangerous protocol detected: ${protocol}`)
					return false
				}
			}

			const urlObj = new URL(url)

			if (!['http:', 'https:'].includes(urlObj.protocol)) {
				this._logger.warn(`Invalid protocol: ${urlObj.protocol}`)
				return false
			}

			if (!urlObj.hostname || urlObj.hostname.length === 0) {
				this._logger.warn('Empty hostname detected')
				return false
			}

			const allowedDomains = this.getAllowedDomains()
			const isAllowed = allowedDomains.some(domain =>
				urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`),
			)

			if (!isAllowed) {
				this._logger.warn(`URL blocked - not in whitelist: ${urlObj.hostname}`)
				return false
			}

			return true
		}
		catch (error: unknown) {
			this._logger.warn(`Invalid URL format: ${url}, error: ${error}`)
			return false
		}
	}

	validateFileSize(sizeBytes: number, format?: string): boolean {
		const maxSizes = this._configService.getOptional('validation.maxFileSizes', MAX_FILE_SIZES)

		const maxSize = format ? (maxSizes as any)[format.toLowerCase()] || maxSizes.default : maxSizes.default
		return sizeBytes > 0 && sizeBytes <= maxSize
	}

	/**
	 * Validate image dimensions
	 * @param width - Image width (0 = use original dimensions, skip resize)
	 * @param height - Image height (0 = use original dimensions, skip resize)
	 * @returns true if dimensions are valid
	 */
	validateImageDimensions(width: number, height: number): boolean {
		// Allow 0 as a special value meaning "use original dimensions"
		// When both are 0, the image processor will skip resizing
		if (width === 0 && height === 0)
			return true

		// If one is 0 and the other is not, that's invalid
		// (we don't support scaling only one dimension with 0)
		if (width === 0 || height === 0)
			return false

		// Reject negative dimensions
		if (width < 0 || height < 0)
			return false

		if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT)
			return false
		if ((width * height) > MAX_TOTAL_PIXELS)
			return false

		return true
	}

	private removeHtmlTags(input: string): string {
		const result: string[] = []
		let insideTag = false
		let i = 0

		while (i < input.length) {
			const char = input[i]

			if (char === '<') {
				insideTag = true
				i++
				continue
			}

			if (char === '>') {
				insideTag = false
				i++
				continue
			}

			if (!insideTag) {
				result.push(char)
			}

			i++
		}

		return result.join('')
	}

	private removeEventHandlers(input: string): string {
		const result: string[] = []
		let i = 0

		while (i < input.length) {
			if (i <= input.length - 2 && input.substring(i, i + 2).toLowerCase() === 'on' && this.isWordBoundary(input, i)) {
				i = this.skipEventHandler(input, i)
				continue
			}

			result.push(input[i])
			i++
		}

		return result.join('')
	}

	private removeStyleAttributes(input: string): string {
		const result: string[] = []
		let i = 0

		while (i < input.length) {
			if (i <= input.length - 5 && input.substring(i, i + 5).toLowerCase() === 'style' && this.isWordBoundary(input, i)) {
				i = this.skipStyleAttribute(input, i)
				continue
			}

			result.push(input[i])
			i++
		}

		return result.join('')
	}

	private removeDangerousProtocols(input: string): string {
		let result = input
		let previousResult = ''

		while (result !== previousResult) {
			previousResult = result

			result = result.replace(/(?:javascript|vbscript|data|file|ftp|about)\s*:\S*/gi, '')

			result = result.replace(/(?:javascript|vbscript|data|file|ftp|about)\s*:/gi, '')

			result = result.replace(/\b(?:javascript|vbscript|data|file|ftp|about)\b/gi, '')
		}

		return result
	}

	private removeDangerousJavaScript(input: string): string {
		let result = input
		let previousResult = ''

		while (result !== previousResult) {
			previousResult = result
			result = result.replace(/(?:expression|eval)\s*\([^)]*\)/gi, '')
			result = result.replace(/(?:expression|eval)\s*\(/gi, '')
			result = result.replace(/\b(?:expression|eval)\b/gi, '')
		}

		return result
	}

	private removeHtmlEntities(input: string): string {
		const result: string[] = []
		let i = 0

		while (i < input.length) {
			if (input[i] === '&') {
				i = this.skipHtmlEntity(input, i)
				continue
			}

			result.push(input[i])
			i++
		}

		return result.join('')
	}

	private isWordBoundary(input: string, index: number): boolean {
		if (index === 0)
			return true
		const prevChar = input[index - 1]
		return !(/\w/.test(prevChar))
	}

	private skipEventHandler(input: string, startIndex: number): number {
		let i = startIndex

		while (i < input.length && /\w/.test(input[i])) {
			i++
		}

		while (i < input.length && /\s/.test(input[i])) {
			i++
		}

		if (i < input.length && input[i] === '=') {
			i++

			while (i < input.length && /\s/.test(input[i])) {
				i++
			}

			if (i < input.length && (input[i] === '"' || input[i] === '\'')) {
				const quote = input[i]
				i++
				while (i < input.length && input[i] !== quote) {
					i++
				}
				if (i < input.length)
					i++
			}
			else {
				while (i < input.length && !/\s/.test(input[i]) && input[i] !== '>' && input[i] !== '<') {
					i++
				}
			}
		}

		return i
	}

	private skipStyleAttribute(input: string, startIndex: number): number {
		let i = startIndex + 5

		while (i < input.length && /\s/.test(input[i])) {
			i++
		}

		if (i < input.length && input[i] === '=') {
			i++

			while (i < input.length && /\s/.test(input[i])) {
				i++
			}

			if (i < input.length && (input[i] === '"' || input[i] === '\'')) {
				const quote = input[i]
				i++
				while (i < input.length && input[i] !== quote) {
					i++
				}
				if (i < input.length)
					i++
			}
			else {
				while (i < input.length && !/\s/.test(input[i]) && input[i] !== '>' && input[i] !== '<') {
					i++
				}
			}
		}

		return i
	}

	private skipHtmlEntity(input: string, startIndex: number): number {
		let i = startIndex + 1

		while (i < input.length && input[i] !== ';' && /[#\w]/.test(input[i])) {
			i++
		}

		if (i < input.length && input[i] === ';') {
			i++
		}

		return i
	}
}
