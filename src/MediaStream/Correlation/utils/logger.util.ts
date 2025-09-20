import { CorrelationService } from '../services/correlation.service'

export class CorrelatedLogger {
	private static _correlationService: CorrelationService | null = null

	static setCorrelationService(service: CorrelationService): void {
		this._correlationService = service
	}

	private static getCorrelationService(): CorrelationService {
		if (!this._correlationService) {
			this._correlationService = new CorrelationService()
		}
		return this._correlationService
	}

	static log(message: string, context?: string): void {
		const correlationId = this.getCorrelationService().getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.log(`${prefix}${contextStr} ${message}`)
	}

	static error(message: string, trace?: string, context?: string): void {
		const correlationId = this.getCorrelationService().getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.error(`${prefix}${contextStr} ERROR: ${message}`)
		if (trace) {
			console.error(`${prefix}${contextStr} TRACE: ${trace}`)
		}
	}

	static warn(message: string, context?: string): void {
		const correlationId = this.getCorrelationService().getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.warn(`${prefix}${contextStr} WARN: ${message}`)
	}

	static debug(message: string, context?: string): void {
		const correlationId = this.getCorrelationService().getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.debug(`${prefix}${contextStr} DEBUG: ${message}`)
	}

	static verbose(message: string, context?: string): void {
		const correlationId = this.getCorrelationService().getCorrelationId()
		const prefix = correlationId ? `[${correlationId}]` : ''
		const contextStr = context ? ` [${context}]` : ''
		console.log(`${prefix}${contextStr} VERBOSE: ${message}`)
	}
}
