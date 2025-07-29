import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '../../../MediaStream/Config/config.service'
import { ISecurityChecker, SecurityEvent } from '../interfaces/validator.interface'

@Injectable()
export class SecurityCheckerService implements ISecurityChecker {
	private readonly logger = new Logger(SecurityCheckerService.name)
	private readonly suspiciousPatterns: RegExp[]
	private readonly securityEvents: SecurityEvent[] = []

	constructor(private readonly configService: ConfigService) {
		// Define patterns that might indicate malicious content
		this.suspiciousPatterns = [
			// Script injection patterns
			/<script[^>]*>/i,
			/javascript:/i,
			/vbscript:/i,
			/data:text\/html/i,
			/on\w+\s*=/i,

			// SQL injection patterns
			/union\s+select/i,
			/drop\s+table/i,
			/insert\s+into/i,
			/delete\s+from/i,

			// Path traversal patterns
			/\.\.\//,
			/\.\.\\/,
			/\.\.\\\\/,
			/%2e%2e%2f/i,
			/%2e%2e%5c/i,

			// Command injection patterns
			/;\s*rm\s+-rf/i,
			/;\s*cat\s+/i,
			/;\s*ls\s+/i,
			/\|\s*nc\s+/i,

			// XXE patterns
			/<!entity/i,
			/<!doctype.*\[/i,

			// LDAP injection patterns
			/\(\|\(/,
			/\)\(\|/,

			// NoSQL injection patterns
			/\$where/i,
			/\$ne/i,
			/\$gt/i,
			/\$lt/i,
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
		// Check against suspicious patterns
		for (const pattern of this.suspiciousPatterns) {
			if (pattern.test(str)) {
				this.logger.warn(`Suspicious pattern detected: ${pattern.source}`)
				return true
			}
		}

		// Check for excessive length (potential DoS)
		const maxLength = this.configService.getOptional('validation.maxStringLength', 10000)
		if (str.length > maxLength) {
			this.logger.warn(`Excessively long string detected: ${str.length} characters`)
			return true
		}

		// Check for high entropy (potential encoded payload)
		if (this.hasHighEntropy(str)) {
			this.logger.warn('High entropy string detected (potential encoded payload)')
			return true
		}

		return false
	}

	private async checkObject(obj: any): Promise<boolean> {
		// Check for prototype pollution attempts
		const dangerousKeys = ['__proto__', 'constructor', 'prototype']
		for (const key of Object.keys(obj)) {
			if (dangerousKeys.includes(key)) {
				this.logger.warn(`Dangerous object key detected: ${key}`)
				return true
			}

			// Recursively check values
			if (await this.checkForMaliciousContent(obj[key])) {
				return true
			}
		}

		// Check for excessive object depth
		if (this.getObjectDepth(obj) > 10) {
			this.logger.warn('Excessively deep object detected (potential DoS)')
			return true
		}

		return false
	}

	private hasHighEntropy(str: string): boolean {
		if (str.length < 20)
			return false

		// Calculate character frequency
		const charCount: { [key: string]: number } = {}
		for (const char of str) {
			charCount[char] = (charCount[char] || 0) + 1
		}

		// Calculate entropy
		let entropy = 0
		const length = str.length
		for (const count of Object.values(charCount)) {
			const probability = count / length
			entropy -= probability * Math.log2(probability)
		}

		// High entropy threshold (base64 encoded data typically has entropy > 4.5)
		return entropy > 4.5
	}

	private getObjectDepth(obj: any, depth = 0): number {
		if (depth > 20)
			return depth // Prevent stack overflow

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
		// Add timestamp if not provided
		if (!event.timestamp) {
			event.timestamp = new Date()
		}

		// Store event (in production, this would go to a security monitoring system)
		this.securityEvents.push(event)

		// Log the event
		this.logger.warn(`Security event: ${event.type}`, {
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

		// For now, just keep the last 1000 events in memory
		if (this.securityEvents.length > 1000) {
			this.securityEvents.shift()
		}
	}

	getSecurityEvents(limit = 100): SecurityEvent[] {
		return this.securityEvents
			.slice(-limit)
			.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
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
			if (event.timestamp > oneHourAgo) {
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
