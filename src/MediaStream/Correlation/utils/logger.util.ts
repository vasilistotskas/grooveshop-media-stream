import { CorrelationService } from '../services/correlation.service'

export class CorrelatedLogger {
	private static correlationService = new CorrelationService()

	static log(message: string, context?: string): void {
		const correlationId = this.correlationService.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.warn(`${prefix}${contextStr} ${message}`)
	}

	static error(message: string, trace?: string, context?: string): void {
		const correlationId = this.correlationService.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.error(`${prefix}${contextStr} ERROR: ${message}`)
		if (trace) {
			console.error(`${prefix}${contextStr} TRACE: ${trace}`)
		}
	}

	static warn(message: string, context?: string): void {
		const correlationId = this.correlationService.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.warn(`${prefix}${contextStr} WARN: ${message}`)
	}

	static debug(message: string, context?: string): void {
		const correlationId = this.correlationService.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.warn(`${prefix}${contextStr} DEBUG: ${message}`)
	}

	static verbose(message: string, context?: string): void {
		const correlationId = this.correlationService.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.warn(`${prefix}${contextStr} VERBOSE: ${message}`)
	}
}
