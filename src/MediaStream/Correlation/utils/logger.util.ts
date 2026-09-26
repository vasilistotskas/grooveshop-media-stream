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

	/**
	 * One structured event. `fields` travel as Nest's structured params:
	 * top-level keys of the JSON line in production (main.ts sets
	 * `flattenParams`; Nest's own `level`/`message`/`context`/... win on a
	 * name clash), an inline object after the message in text mode. Name the
	 * correlation id among the fields: this may run after the request's
	 * async context has ended.
	 */
	static event(level: 'log' | 'warn', message: string, fields: Record<string, unknown>, context?: string): void {
		CorrelatedLogger.loggerFor(context)[level](message, fields)
	}

	static debug(message: string, context?: string): void {
		CorrelatedLogger.loggerFor(context).debug(CorrelatedLogger.withCorrelationId(message))
	}
}
