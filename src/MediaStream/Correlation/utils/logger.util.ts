import { Logger } from '@nestjs/common'
import { requestContextStorage } from '../async-local-storage.js'

const DEFAULT_CONTEXT = 'CorrelatedLogger'

/**
 * Static logger that prefixes every line with the current request's
 * correlation id. It keeps one Nest `Logger` per context: an instance logger
 * that already has a context treats a trailing string argument as an extra
 * message (printed on its own line), so the context must go through the
 * constructor and never through the call.
 */
export class CorrelatedLogger {
	private static readonly loggers = new Map<string, Logger>()

	private static loggerFor(context: string = DEFAULT_CONTEXT): Logger {
		let logger = CorrelatedLogger.loggers.get(context)
		if (!logger) {
			logger = new Logger(context)
			CorrelatedLogger.loggers.set(context, logger)
		}
		return logger
	}

	private static withCorrelationId(message: string): string {
		const correlationId = requestContextStorage.getStore()?.correlationId
		return correlationId ? `[${correlationId}] ${message}` : message
	}

	static log(message: string, context?: string): void {
		CorrelatedLogger.loggerFor(context).log(CorrelatedLogger.withCorrelationId(message))
	}

	static error(message: string, trace?: string, context?: string): void {
		const logger = CorrelatedLogger.loggerFor(context)
		const text = CorrelatedLogger.withCorrelationId(message)
		if (trace) {
			logger.error(text, trace)
		}
		else {
			logger.error(text)
		}
	}

	static warn(message: string, context?: string): void {
		CorrelatedLogger.loggerFor(context).warn(CorrelatedLogger.withCorrelationId(message))
	}

	static debug(message: string, context?: string): void {
		CorrelatedLogger.loggerFor(context).debug(CorrelatedLogger.withCorrelationId(message))
	}
}
