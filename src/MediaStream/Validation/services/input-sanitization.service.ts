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

		// Use comprehensive HTML tag removal that handles incomplete tags
		result = this.removeHtmlTags(result)

		// Remove dangerous patterns using robust character-by-character approach
		result = this.removeEventHandlers(result)
		result = this.removeStyleAttributes(result)

		// Remove dangerous protocols with comprehensive pattern matching
		result = this.removeDangerousProtocols(result)

		// Remove CSS expressions and eval with comprehensive matching
		result = this.removeDangerousJavaScript(result)

		// Remove HTML entities with comprehensive matching
		result = this.removeHtmlEntities(result)

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

	private removeHtmlTags(input: string): string {
		// Use character-by-character filtering to completely eliminate HTML injection risks
		// This approach is more secure than regex-based sanitization
		const result: string[] = []
		let insideTag = false
		let i = 0

		while (i < input.length) {
			const char = input[i]

			if (char === '<') {
				// Start of potential HTML tag - skip everything until >
				insideTag = true
				i++
				continue
			}

			if (char === '>') {
				// End of potential HTML tag
				insideTag = false
				i++
				continue
			}

			if (!insideTag) {
				// Only include characters that are outside of HTML tags
				result.push(char)
			}

			i++
		}

		return result.join('')
	}

	private removeEventHandlers(input: string): string {
		// Use character-by-character analysis to remove event handlers completely
		const result: string[] = []
		let i = 0

		while (i < input.length) {
			// Look for 'on' followed by word characters and '='
			if (i <= input.length - 2
				&& input.substring(i, i + 2).toLowerCase() === 'on'
				&& this.isWordBoundary(input, i)) {
				// Found potential event handler, skip it entirely
				i = this.skipEventHandler(input, i)
				continue
			}

			result.push(input[i])
			i++
		}

		return result.join('')
	}

	private removeStyleAttributes(input: string): string {
		// Use character-by-character analysis to remove style attributes completely
		const result: string[] = []
		let i = 0

		while (i < input.length) {
			// Look for 'style' followed by optional whitespace and '='
			if (i <= input.length - 5
				&& input.substring(i, i + 5).toLowerCase() === 'style'
				&& this.isWordBoundary(input, i)) {
				// Found potential style attribute, skip it entirely
				i = this.skipStyleAttribute(input, i)
				continue
			}

			result.push(input[i])
			i++
		}

		return result.join('')
	}

	private removeDangerousProtocols(input: string): string {
		// Comprehensive dangerous protocol removal
		let result = input
		let previousResult = ''

		// Keep removing until no more changes occur
		while (result !== previousResult) {
			previousResult = result

			// Remove complete dangerous protocol URLs
			result = result.replace(/(?:javascript|vbscript|data|file|ftp|about)\s*:\S*/gi, '')

			// Remove incomplete protocol declarations
			result = result.replace(/(?:javascript|vbscript|data|file|ftp|about)\s*:/gi, '')

			// Remove protocol names that could be part of incomplete declarations
			result = result.replace(/\b(?:javascript|vbscript|data|file|ftp|about)\b/gi, '')
		}

		return result
	}

	private removeDangerousJavaScript(input: string): string {
		// Comprehensive JavaScript and expression removal - only target specific dangerous patterns
		let result = input
		let previousResult = ''

		// Keep removing until no more changes occur
		while (result !== previousResult) {
			previousResult = result

			// Remove CSS expressions and eval calls (these are always dangerous)
			result = result.replace(/(?:expression|eval)\s*\([^)]*\)/gi, '')

			// Remove incomplete expressions
			result = result.replace(/(?:expression|eval)\s*\(/gi, '')

			// Remove the keywords themselves only for CSS expressions and eval
			result = result.replace(/\b(?:expression|eval)\b/gi, '')

			// Don't remove other JavaScript keywords as they might be legitimate text content
			// Only remove them if they appear in very specific dangerous contexts like URLs
		}

		return result
	}

	private removeHtmlEntities(input: string): string {
		// Use character-by-character analysis to remove HTML entities completely
		const result: string[] = []
		let i = 0

		while (i < input.length) {
			if (input[i] === '&') {
				// Found potential HTML entity, skip it entirely
				i = this.skipHtmlEntity(input, i)
				continue
			}

			result.push(input[i])
			i++
		}

		return result.join('')
	}

	private isWordBoundary(input: string, index: number): boolean {
		// Check if the position is at a word boundary (start of word)
		if (index === 0)
			return true
		const prevChar = input[index - 1]
		return !(/\w/.test(prevChar))
	}

	private skipEventHandler(input: string, startIndex: number): number {
		let i = startIndex

		// Skip 'on' and any following word characters
		while (i < input.length && /\w/.test(input[i])) {
			i++
		}

		// Skip whitespace
		while (i < input.length && /\s/.test(input[i])) {
			i++
		}

		// If we find '=', skip the entire value
		if (i < input.length && input[i] === '=') {
			i++ // skip '='

			// Skip whitespace after '='
			while (i < input.length && /\s/.test(input[i])) {
				i++
			}

			// Skip the value (quoted or unquoted)
			if (i < input.length && (input[i] === '"' || input[i] === '\'')) {
				const quote = input[i]
				i++ // skip opening quote
				while (i < input.length && input[i] !== quote) {
					i++
				}
				if (i < input.length)
					i++ // skip closing quote
			}
			else {
				// Skip unquoted value
				while (i < input.length && !/\s/.test(input[i]) && input[i] !== '>' && input[i] !== '<') {
					i++
				}
			}
		}

		return i
	}

	private skipStyleAttribute(input: string, startIndex: number): number {
		let i = startIndex + 5 // skip 'style'

		// Skip whitespace
		while (i < input.length && /\s/.test(input[i])) {
			i++
		}

		// If we find '=', skip the entire value
		if (i < input.length && input[i] === '=') {
			i++ // skip '='

			// Skip whitespace after '='
			while (i < input.length && /\s/.test(input[i])) {
				i++
			}

			// Skip the value (quoted or unquoted)
			if (i < input.length && (input[i] === '"' || input[i] === '\'')) {
				const quote = input[i]
				i++ // skip opening quote
				while (i < input.length && input[i] !== quote) {
					i++
				}
				if (i < input.length)
					i++ // skip closing quote
			}
			else {
				// Skip unquoted value
				while (i < input.length && !/\s/.test(input[i]) && input[i] !== '>' && input[i] !== '<') {
					i++
				}
			}
		}

		return i
	}

	private skipHtmlEntity(input: string, startIndex: number): number {
		let i = startIndex + 1 // skip '&'

		// Skip until we find ';' or reach end of potential entity
		while (i < input.length && input[i] !== ';' && /[#\w]/.test(input[i])) {
			i++
		}

		// If we found ';', skip it too
		if (i < input.length && input[i] === ';') {
			i++
		}

		return i
	}
}
