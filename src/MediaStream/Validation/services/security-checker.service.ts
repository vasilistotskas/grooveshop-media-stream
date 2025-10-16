import type { ISecurityChecker, SecurityEvent } from '../interfaces/validator.interface'
import { ConfigService } from '#microservice/Config/config.service'
import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class SecurityCheckerService implements ISecurityChecker {
	private readonly _logger = new Logger(SecurityCheckerService.name)
	private readonly suspiciousPatterns: RegExp[]
	private readonly securityEvents: SecurityEvent[] = []

	constructor(private readonly _configService: ConfigService) {
		this.suspiciousPatterns = [
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
	}

	async checkForMaliciousContent(input: any): Promise<boolean> {
		if (input === null || input === undefined) {
			return false
		}

		if (typeof input === 'string') {
			return this.checkString(input)
		}

		if (typeof input === 'object') {
			return this.checkObject(input)
		}

		if (Array.isArray(input)) {
			for (const item of input) {
				if (await this.checkForMaliciousContent(item)) {
					return true
				}
			}
		}

		return false
	}

	private checkString(str: string): boolean {
		const maxLength = this._configService.getOptional('validation.maxStringLength', 10000)
		if (str.length === 0) {
			return false
		}
		if (str.length > maxLength) {
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

		if (this.hasHighEntropy(str)) {
			this._logger.warn('High entropy string detected (potential encoded payload)')
			return true
		}

		return false
	}

	private async checkObject(obj: any): Promise<boolean> {
		const dangerousKeys = ['__proto__', 'constructor', 'prototype']
		for (const key of Object.keys(obj)) {
			if (dangerousKeys.includes(key)) {
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

		this.securityEvents.push(event)

		this._logger.warn(`Security event: ${event.type}`, {
			source: event.source,
			details: event.details,
			clientIp: event.clientIp,
			userAgent: event.userAgent,
			timestamp: event.timestamp,
		})

		// In production, you might want to:
		// - Send to SIEM system
		// - Trigger alerts for critical events
		// - Update threat intelligence feeds
		// - Block suspicious IPs temporarily

		if (this.securityEvents.length > 1000) {
			this.securityEvents.shift()
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
