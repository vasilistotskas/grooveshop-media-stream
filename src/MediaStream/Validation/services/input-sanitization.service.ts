import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '../../../MediaStream/Config/config.service'
import { ISanitizer } from '../interfaces/validator.interface'

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
				'example.com',
				'test.com',
				'grooveshop.com',
				'cdn.grooveshop.com',
				'images.grooveshop.com',
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
		// Check for dangerous protocols and return empty string if found
		const lowerStr = str.toLowerCase()
		const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:', 'about:']
		for (const protocol of dangerousProtocols) {
			if (lowerStr.startsWith(protocol)) {
				return ''
			}
		}

		// Check for patterns that should result in empty string (standalone dangerous patterns)
		const emptyStringPatterns = [
			/^\s*on\w+\s*=.*$/i, // Standalone event handlers
			/^\s*javascript\s*:.*$/i, // Standalone JavaScript protocol
			/^\s*vbscript\s*:.*$/i, // Standalone VBScript protocol
			/^\s*data\s*:.*$/i, // Standalone Data URLs
		]

		for (const pattern of emptyStringPatterns) {
			if (pattern.test(str)) {
				this._logger.warn(`Standalone dangerous pattern detected, returning empty string`)
				return ''
			}
		}

		// Use iterative sanitization to handle nested patterns and prevent bypasses
		let sanitized = str
		let previousLength = 0
		let iterations = 0
		const maxIterations = 10 // Prevent infinite loops

		// Keep sanitizing until no more changes occur or max iterations reached
		while (sanitized.length !== previousLength && iterations < maxIterations) {
			previousLength = sanitized.length
			iterations++

			// Remove dangerous patterns iteratively
			sanitized = this.performSanitizationPass(sanitized)
		}

		// Final cleanup
		sanitized = sanitized.trim()

		// Limit string length to prevent DoS
		const maxLength = 2048
		if (sanitized.length > maxLength) {
			sanitized = sanitized.substring(0, maxLength)
			this._logger.warn(`String truncated to ${maxLength} characters for security`)
		}

		return sanitized
	}

	private performSanitizationPass(input: string): string {
		let result = input

		// Use a whitelist approach - remove all HTML tags but preserve text content
		// This is safer than trying to match complex nested patterns
		result = result.replace(/<[^>]*>/g, '')

		// Remove dangerous patterns using iterative character-by-character approach
		result = this.removeEventHandlers(result)
		result = this.removeStyleAttributes(result)

		// Remove dangerous protocols
		result = result.replace(/(?:javascript|vbscript|data|file|ftp|about)\s*:\S*/gi, '')

		// Remove data URLs
		result = result.replace(/data\s*:[^,\s]*/gi, '')

		// Remove CSS expressions and eval
		result = result.replace(/(?:expression|eval)\s*\(/gi, '')

		// Remove HTML entities
		result = result.replace(/&[#\w]+;/g, '')
		result = result.replace(/&#x?[0-9a-f]+;?/gi, '')

		return result
	}

	private async sanitizeObject(obj: any): Promise<any> {
		const sanitized: any = {}

		for (const [key, value] of Object.entries(obj)) {
			// Sanitize the key itself
			const sanitizedKey = this.sanitizeString(String(key))

			// Recursively sanitize the value
			sanitized[sanitizedKey] = await this.sanitize(value)
		}

		return sanitized
	}

	validateUrl(url: string): boolean {
		try {
			// Pre-validate URL string for dangerous protocols
			const lowerUrl = url.toLowerCase().trim()
			const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:', 'about:']
			for (const protocol of dangerousProtocols) {
				if (lowerUrl.startsWith(protocol)) {
					this._logger.warn(`Dangerous protocol detected: ${protocol}`)
					return false
				}
			}

			const urlObj = new URL(url)

			// Only allow HTTP and HTTPS protocols
			if (!['http:', 'https:'].includes(urlObj.protocol)) {
				this._logger.warn(`Invalid protocol: ${urlObj.protocol}`)
				return false
			}

			// Validate hostname format
			if (!urlObj.hostname || urlObj.hostname.length === 0) {
				this._logger.warn('Empty hostname detected')
				return false
			}

			// Check against whitelist
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
		const maxSizes = this._configService.getOptional('validation.maxFileSizes', {
			default: 10 * 1024 * 1024, // 10MB
			jpeg: 5 * 1024 * 1024, // 5MB
			jpg: 5 * 1024 * 1024, // 5MB
			png: 8 * 1024 * 1024, // 8MB
			webp: 3 * 1024 * 1024, // 3MB
			gif: 2 * 1024 * 1024, // 2MB
			svg: 1024 * 1024, // 1MB
		})

		const maxSize = format ? maxSizes[format.toLowerCase()] || maxSizes.default : maxSizes.default
		return sizeBytes > 0 && sizeBytes <= maxSize
	}

	validateImageDimensions(width: number, height: number): boolean {
		// Maximum dimensions
		const maxWidth = 8192 // 8K width
		const maxHeight = 8192 // 8K height
		const maxPixels = 7680 * 4320 // 8K total pixels

		if (width <= 0 || height <= 0)
			return false
		if (width > maxWidth || height > maxHeight)
			return false
		if ((width * height) > maxPixels)
			return false

		return true
	}

	private removeEventHandlers(input: string): string {
		// Use a more robust approach to remove event handlers
		// This prevents bypasses by removing any sequence that looks like an event handler
		let result = input
		let previousResult = ''

		// Keep removing until no more changes occur
		while (result !== previousResult) {
			previousResult = result
			// Remove event handlers with their values (including quoted content)
			result = result.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
			result = result.replace(/\bon\w+\s*=\s*[^"'\s]+/gi, '')
			result = result.replace(/\bon\w+\s*=/gi, '')
		}

		return result
	}

	private removeStyleAttributes(input: string): string {
		// Use a more robust approach to remove style attributes
		// This prevents bypasses by removing any sequence that looks like a style attribute
		let result = input
		let previousResult = ''

		// Keep removing until no more changes occur
		while (result !== previousResult) {
			previousResult = result
			// Remove style attributes with their values (including quoted content)
			result = result.replace(/\bstyle\s*=\s*["'][^"']*["']/gi, '')
			result = result.replace(/\bstyle\s*=\s*[^"'\s]+/gi, '')
			result = result.replace(/\bstyle\s*=/gi, '')
		}

		return result
	}
}
