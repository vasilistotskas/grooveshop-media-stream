import { Logger } from '@nestjs/common'
import { requestContextStorage } from '../async-local-storage.js'

export class CorrelatedLogger {
	private static readonly nestLogger = new Logger('CorrelatedLogger')

	private static getCorrelationId(): string | null {
		const store = requestContextStorage.getStore()
		return store?.correlationId || null
	}

	static log(message: string, context?: string): void {
		const correlationId = this.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}] ` : ''
		CorrelatedLogger.nestLogger.log(`${prefix}${message}`, context)
	}

	static error(message: string, trace?: string, context?: string): void {
		const correlationId = this.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}] ` : ''
		CorrelatedLogger.nestLogger.error(`${prefix}${message}`, trace, context)
	}

	static warn(message: string, context?: string): void {
		const correlationId = this.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}] ` : ''
		CorrelatedLogger.nestLogger.warn(`${prefix}${message}`, context)
	}

	static debug(message: string, context?: string): void {
		const correlationId = this.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}] ` : ''
		CorrelatedLogger.nestLogger.debug(`${prefix}${message}`, context)
	}

	static verbose(message: string, context?: string): void {
		const correlationId = this.getCorrelationId()
		const prefix = correlationId ? `[${correlationId}] ` : ''
		CorrelatedLogger.nestLogger.verbose(`${prefix}${message}`, context)
	}
}
