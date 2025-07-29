import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '../../../MediaStream/Config/config.service'
import { ISanitizer } from '../interfaces/validator.interface'

@Injectable()
export class InputSanitizationService implements ISanitizer<any> {
	private readonly logger = new Logger(InputSanitizationService.name)
	private allowedDomains: string[] | null = null

	constructor(private readonly configService: ConfigService) {
	}

	private getAllowedDomains(): string[] {
		if (this.allowedDomains === null) {
			this.allowedDomains = this.configService.getOptional<string[]>('validation.allowedDomains', [
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
		// Check for javascript: protocol and return empty string if found
		if (str.toLowerCase().startsWith('javascript:')) {
			return ''
		}

		// Remove potentially dangerous characters and patterns
		let sanitized = str
			// Remove script tags
			.replace(/<script[^>]*>.*?<\/script>/gi, '')
			// Remove on* event handlers - more comprehensive
			.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
			.replace(/on\w+\s*=\s*[^"'\s>]+/gi, '')
			// Remove data URLs with HTML content
			.replace(/data:text\/html[^;]*;/gi, '')
			// Remove vbscript
			.replace(/vbscript\s*:/gi, '')
			// Remove CSS expressions
			.replace(/expression\s*\(/gi, '')
			// Trim whitespace
			.trim()

		// Limit string length to prevent DoS
		const maxLength = 2048
		if (sanitized.length > maxLength) {
			sanitized = sanitized.substring(0, maxLength)
			this.logger.warn(`String truncated to ${maxLength} characters for security`)
		}

		return sanitized
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
			const urlObj = new URL(url)

			// Check protocol
			if (!['http:', 'https:'].includes(urlObj.protocol)) {
				return false
			}

			// Check against whitelist
			const allowedDomains = this.getAllowedDomains()
			const isAllowed = allowedDomains.some(domain =>
				urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`),
			)

			if (!isAllowed) {
				this.logger.warn(`URL blocked - not in whitelist: ${urlObj.hostname}`)
				return false
			}

			return true
		}
		catch (error) {
			this.logger.warn(`Invalid URL format: ${url}, error: ${error}`)
			return false
		}
	}

	validateFileSize(sizeBytes: number, format?: string): boolean {
		const maxSizes = this.configService.getOptional('validation.maxFileSizes', {
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
}
