import { requestContextStorage } from '../async-local-storage.js'

export class CorrelatedLogger {
	private static getCorrelationId(): string | null {
		const store = requestContextStorage.getStore()
		return store?.correlationId || null
	}

	static log(message: string, context?: string): void {
		const correlationId = this.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.log(`${prefix}${contextStr} ${message}`)
	}

	static error(message: string, trace?: string, context?: string): void {
		const correlationId = this.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.error(`${prefix}${contextStr} ERROR: ${message}`)
		if (trace) {
			console.error(`${prefix}${contextStr} TRACE: ${trace}`)
		}
	}

	static warn(message: string, context?: string): void {
		const correlationId = this.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.warn(`${prefix}${contextStr} WARN: ${message}`)
	}

	static debug(message: string, context?: string): void {
		const correlationId = this.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.debug(`${prefix}${contextStr} DEBUG: ${message}`)
	}

	static verbose(message: string, context?: string): void {
		const correlationId = this.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.log(`${prefix}${contextStr} VERBOSE: ${message}`)
	}
}
