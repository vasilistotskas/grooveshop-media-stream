import type { ISecurityChecker, SecurityEvent } from '../interfaces/validator.interface.js'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { ConfigService } from '#microservice/Config/config.service'
import { Injectable, Logger, Optional } from '@nestjs/common'

const SUSPICIOUS_PATTERNS: RegExp[] = [
	/<script\b[^>]{0,100}>/i,
	/javascript:/i,
	/vbscript:/i,
	/data:text\/html/i,
	/\bon\w{1,20}\s*=/i,

	/union\s{1,5}select/i,
	/drop\s{1,5}table/i,
	/insert\s{1,5}into/i,
	/delete\s{1,5}from/i,

	/\.\.\//,
	/\.\.\\/,
	/\.\.\\\\/,
	/%2e%2e%2f/i,
	/%2e%2e%5c/i,

	/;\s{0,5}rm\s{1,5}-rf/i,
	/;\s{0,5}cat\s{1,5}/i,
	/;\s{0,5}ls\s{1,5}/i,
	/\|\s{0,5}nc\s{1,5}/i,

	/<!entity\b/i,
	/<!doctype[^>]{0,100}\[/i,

	/\(\|\(/,
	/\)\(\|/,

	/\$where\b/i,
	/\$ne\b/i,
	/\$gt\b/i,
	/\$lt\b/i,
]

const IMAGE_EXTENSION_RE = /\.(?:jpe?g|png|gif|webp|svg|bmp|tiff?|ico|avif)$/i
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const REDIS_SECURITY_EVENTS_KEY = 'security:events'
const REDIS_SECURITY_EVENTS_MAX = 10000

@Injectable()
export class SecurityCheckerService implements ISecurityChecker {
	private readonly _logger = new Logger(SecurityCheckerService.name)
	private readonly suspiciousPatterns: RegExp[]
	private readonly securityEvents: SecurityEvent[] = []
	private readonly maxStringLength: number

	constructor(
		private readonly _configService: ConfigService,
		@Optional() private readonly _redisCacheService: RedisCacheService | null,
	) {
		this.suspiciousPatterns = SUSPICIOUS_PATTERNS
		this.maxStringLength = this._configService.getOptional('validation.maxStringLength', 10000)
	}

	async checkForMaliciousContent(input: any): Promise<boolean> {
		if (input === null || input === undefined) {
			return false
		}

		if (typeof input === 'string') {
			return this.checkString(input)
		}

		if (Array.isArray(input)) {
			for (const item of input) {
				if (await this.checkForMaliciousContent(item)) {
					return true
				}
			}
			return false
		}

		if (typeof input === 'object') {
			return this.checkObject(input)
		}

		return false
	}

	private checkString(str: string): boolean {
		if (str.length === 0) {
			return false
		}
		if (str.length > this.maxStringLength) {
			this._logger.warn(`Excessively long string detected: ${str.length} characters`)
			return true
		}

		const maxPatternTestLength = 5000
		const testStr = str.length > maxPatternTestLength ? str.substring(0, maxPatternTestLength) : str

		for (const pattern of this.suspiciousPatterns) {
			try {
				if (pattern.test(testStr)) {
					this._logger.warn(`Suspicious pattern detected: ${pattern.source}`)
					return true
				}
			}
			catch {
				this._logger.warn(`Pattern matching failed, potential ReDoS attempt: ${pattern.source}`)
				return true
			}
		}

		// Check decoded variants to catch mixed-case encoding (%2E%2E/),
		// partial encoding (..%2f), and overlong UTF-8 sequences (%c0%ae...)
		if (this.containsPathTraversal(str)) {
			this._logger.warn('Path traversal detected in decoded input')
			return true
		}

		if (this.hasHighEntropy(str)) {
			this._logger.warn('High entropy string detected (potential encoded payload)')
			return true
		}

		return false
	}

	private containsPathTraversal(path: string): boolean {
		// Raw string already checked by suspiciousPatterns above — only need decoded variants
		try {
			const decoded = decodeURIComponent(path)
			if (decoded !== path && this.suspiciousPatterns.some((p) => {
				try {
					return p.test(decoded)
				}
				catch {
					return true
				}
			})) {
				return true
			}

			// Double-decode catches sequences encoded twice (%252e%252e%252f → ../)
			const doubleDecoded = decodeURIComponent(decoded)
			if (doubleDecoded !== decoded && this.suspiciousPatterns.some((p) => {
				try {
					return p.test(doubleDecoded)
				}
				catch {
					return true
				}
			})) {
				return true
			}
		}
		catch {
			// Malformed percent-encoding is inherently suspicious — reject it
			return true
		}

		return false
	}

	private async checkObject(obj: any): Promise<boolean> {
		for (const key of Object.keys(obj)) {
			if (DANGEROUS_KEYS.has(key)) {
				this._logger.warn(`Dangerous object key detected: ${key}`)
				return true
			}

			if (await this.checkForMaliciousContent(obj[key])) {
				return true
			}
		}

		if (this.getObjectDepth(obj) > 10) {
			this._logger.warn('Excessively deep object detected (potential DoS)')
			return true
		}

		return false
	}

	private hasHighEntropy(str: string): boolean {
		const maxLengthForEntropy = 1000
		if (str.length < 20 || str.length > maxLengthForEntropy)
			return false

		// Skip entropy check for filenames with common image extensions
		// file upload system could adds random suffixes like __ytXSDgf which have high entropy
		if (IMAGE_EXTENSION_RE.test(str)) {
			return false
		}

		const sampleStr = str.length > 500 ? str.substring(0, 500) : str

		const charCount: { [key: string]: number } = {}
		for (const char of sampleStr) {
			charCount[char] = (charCount[char] || 0) + 1
		}

		if (Object.keys(charCount).length > 256) {
			return false
		}

		let entropy = 0
		const length = sampleStr.length
		for (const count of Object.values(charCount)) {
			const probability = count / length
			entropy -= probability * Math.log2(probability)
		}

		return entropy > 4.5
	}

	private getObjectDepth(obj: any, depth = 0): number {
		if (depth > 20)
			return depth

		if (obj === null || typeof obj !== 'object') {
			return depth
		}

		let maxDepth = depth
		for (const value of Object.values(obj)) {
			if (typeof value === 'object' && value !== null) {
				const childDepth = this.getObjectDepth(value, depth + 1)
				maxDepth = Math.max(maxDepth, childDepth)
			}
		}

		return maxDepth
	}

	async logSecurityEvent(event: SecurityEvent): Promise<void> {
		if (!event.timestamp) {
			event.timestamp = new Date()
		}

		// Fast in-memory store for health/stats endpoints (capped at 1000)
		this.securityEvents.push(event)
		if (this.securityEvents.length > 1000) {
			this.securityEvents.shift()
		}

		this._logger.warn(`Security event: ${event.type}`, {
			source: event.source,
			details: event.details,
			clientIp: event.clientIp,
			userAgent: event.userAgent,
			timestamp: event.timestamp,
		})

		// Persist to Redis for cross-replica visibility and crash durability (fire-and-forget)
		this.persistEventToRedis(event)
	}

	private persistEventToRedis(event: SecurityEvent): void {
		const redisClient = this._redisCacheService?.getClient()
		if (!redisClient) {
			return
		}

		const serialized = JSON.stringify(event)
		redisClient.lpush(REDIS_SECURITY_EVENTS_KEY, serialized)
			.then(() => redisClient.ltrim(REDIS_SECURITY_EVENTS_KEY, 0, REDIS_SECURITY_EVENTS_MAX - 1))
			.catch((error: unknown) => {
				this._logger.warn(`Failed to persist security event to Redis: ${(error as Error).message}`)
			})
	}

	async getRecentEventsFromRedis(limit = 100): Promise<SecurityEvent[]> {
		const redisClient = this._redisCacheService?.getClient()
		if (!redisClient) {
			return []
		}

		try {
			const raw = await redisClient.lrange(REDIS_SECURITY_EVENTS_KEY, 0, limit - 1)
			return raw.map((entry) => {
				const parsed = JSON.parse(entry) as SecurityEvent
				if (parsed.timestamp) {
					parsed.timestamp = new Date(parsed.timestamp)
				}
				return parsed
			})
		}
		catch (error: unknown) {
			this._logger.warn(`Failed to read security events from Redis: ${(error as Error).message}`)
			return []
		}
	}

	getSecurityEvents(limit = 100): SecurityEvent[] {
		return this.securityEvents
			.slice(-limit)
			.sort((a: any, b: any) => b.timestamp.getTime() - a.timestamp.getTime())
	}

	getSecurityStats(): {
		totalEvents: number
		eventsByType: { [key: string]: number }
		recentEvents: number
	} {
		const now = new Date()
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

		const eventsByType: { [key: string]: number } = {}
		let recentEvents = 0

		for (const event of this.securityEvents) {
			eventsByType[event.type] = (eventsByType[event.type] || 0) + 1
			if (event.timestamp && event.timestamp > oneHourAgo) {
				recentEvents++
			}
		}

		return {
			totalEvents: this.securityEvents.length,
			eventsByType,
			recentEvents,
		}
	}
}
