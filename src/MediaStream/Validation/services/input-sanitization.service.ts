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

const EMPTY_STRING_PATTERNS: RegExp[] = [
	/^\s*on\w+\s*=.*$/i,
	/^\s*javascript\s*:.*$/i,
	/^\s*vbscript\s*:.*$/i,
	/^\s*data\s*:.*$/i,
]

const DANGEROUS_PROTOCOL_URL_RE = /(?:javascript|vbscript|data|file|ftp|about)\s*:\S*/gi
const DANGEROUS_PROTOCOL_RE = /(?:javascript|vbscript|data|file|ftp|about)\s*:/gi
const DANGEROUS_PROTOCOL_WORD_RE = /\b(?:javascript|vbscript|data|file|ftp|about)\b/gi

const DANGEROUS_JS_CALL_RE = /(?:expression|eval)\s*\([^)]*\)/gi
const DANGEROUS_JS_OPEN_RE = /(?:expression|eval)\s*\(/gi
const DANGEROUS_JS_WORD_RE = /\b(?:expression|eval)\b/gi

const WORD_CHAR_RE = /\w/
const WHITESPACE_CHAR_RE = /\s/
const HTML_ENTITY_CHAR_RE = /[#\w]/

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

		for (const pattern of EMPTY_STRING_PATTERNS) {
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
	 * Validate image dimensions.
	 *
	 * Sharp supports aspect-ratio-preserving single-axis resize when exactly one
	 * dimension is provided and the other is omitted (or 0).  Both of the
	 * following are valid resize requests:
	 *   - width=800, height=0  → scale to 800 px wide, preserve aspect ratio
	 *   - width=0, height=600  → scale to 600 px tall, preserve aspect ratio
	 *
	 * Rules:
	 *   - (0, 0) is valid: "use original dimensions, skip resize"
	 *   - (w, 0) or (0, h) is valid when the non-zero side is within limits:
	 *     aspect-ratio-preserving single-axis resize
	 *   - Negative values are always invalid
	 *   - Both non-zero: both must be within MAX_IMAGE_WIDTH / MAX_IMAGE_HEIGHT
	 *     and their product must not exceed MAX_TOTAL_PIXELS
	 *
	 * Note: When both dimensions are 0 (pass-through), the actual pixel
	 * count is unknown at validation time. This is intentional — the
	 * Sharp pipeline enforces `limitInputPixels: 268402689` on every
	 * input (Buffer or path), which is the authoritative DoS guard.
	 * Validation only rejects requested *output* dimensions; oversized
	 * source images are caught downstream regardless of whether the
	 * caller asked for a resize.
	 */
	validateImageDimensions(width: number, height: number): boolean {
		// Reject negative values unconditionally
		if (width < 0 || height < 0)
			return false

		// (0, 0): pass-through — skip resize entirely
		if (width === 0 && height === 0)
			return true

		// Single-axis resize: exactly one of width/height is 0
		// Validate that the non-zero dimension is within its respective limit
		if (width === 0) {
			// height-only resize
			return height <= MAX_IMAGE_HEIGHT
		}
		if (height === 0) {
			// width-only resize
			return width <= MAX_IMAGE_WIDTH
		}

		// Both non-zero: full two-axis resize
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

			result = result.replace(DANGEROUS_PROTOCOL_URL_RE, '')

			result = result.replace(DANGEROUS_PROTOCOL_RE, '')

			result = result.replace(DANGEROUS_PROTOCOL_WORD_RE, '')
		}

		return result
	}

	private removeDangerousJavaScript(input: string): string {
		let result = input
		let previousResult = ''

		while (result !== previousResult) {
			previousResult = result
			result = result.replace(DANGEROUS_JS_CALL_RE, '')
			result = result.replace(DANGEROUS_JS_OPEN_RE, '')
			result = result.replace(DANGEROUS_JS_WORD_RE, '')
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
		return !(WORD_CHAR_RE.test(prevChar))
	}

	private skipEventHandler(input: string, startIndex: number): number {
		let i = startIndex

		while (i < input.length && WORD_CHAR_RE.test(input[i])) {
			i++
		}

		while (i < input.length && WHITESPACE_CHAR_RE.test(input[i])) {
			i++
		}

		if (i < input.length && input[i] === '=') {
			i++

			while (i < input.length && WHITESPACE_CHAR_RE.test(input[i])) {
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
				while (i < input.length && !WHITESPACE_CHAR_RE.test(input[i]) && input[i] !== '>' && input[i] !== '<') {
					i++
				}
			}
		}

		return i
	}

	private skipStyleAttribute(input: string, startIndex: number): number {
		let i = startIndex + 5

		while (i < input.length && WHITESPACE_CHAR_RE.test(input[i])) {
			i++
		}

		if (i < input.length && input[i] === '=') {
			i++

			while (i < input.length && WHITESPACE_CHAR_RE.test(input[i])) {
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
				while (i < input.length && !WHITESPACE_CHAR_RE.test(input[i]) && input[i] !== '>' && input[i] !== '<') {
					i++
				}
			}
		}

		return i
	}

	private skipHtmlEntity(input: string, startIndex: number): number {
		let i = startIndex + 1

		while (i < input.length && input[i] !== ';' && HTML_ENTITY_CHAR_RE.test(input[i])) {
			i++
		}

		if (i < input.length && input[i] === ';') {
			i++
		}

		return i
	}
}
