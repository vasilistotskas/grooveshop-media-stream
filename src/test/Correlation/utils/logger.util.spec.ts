import type { MockInstance } from 'vitest'
import type { RequestContext } from '#microservice/Correlation/interfaces/correlation.interface'
import * as process from 'node:process'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestContextStorage } from '#microservice/Correlation/async-local-storage'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

function createRequestContext(correlationId: string): RequestContext {
	return {
		correlationId,
		timestamp: Date.now(),
		clientIp: '127.0.0.1',
		method: 'GET',
		url: '/test',
		startTime: process.hrtime.bigint(),
	}
}

/** The context of the Nest `Logger` instance the last call went through. */
function contextOfLastCall(spy: MockInstance): string | undefined {
	const instance = spy.mock.contexts.at(-1) as unknown as { context?: string }
	return instance.context
}

function withCorrelationId(fn: () => void): void {
	requestContextStorage.run(createRequestContext('test-correlation-id'), fn)
}

describe('correlatedLogger', () => {
	let log: MockInstance
	let error: MockInstance
	let warn: MockInstance
	let debug: MockInstance

	beforeEach(() => {
		log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
		error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
		warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
		debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('log', () => {
		it('prefixes the correlation id when a request context is active', () => {
			withCorrelationId(() => {
				CorrelatedLogger.log('Test message')
			})

			expect(log).toHaveBeenCalledWith('[test-correlation-id] Test message')
			expect(contextOfLastCall(log)).toBe('CorrelatedLogger')
		})

		it('logs the bare message outside a request context', () => {
			CorrelatedLogger.log('Test message')

			expect(log).toHaveBeenCalledWith('Test message')
		})

		it('routes the context through the logger instance, never as a call argument', () => {
			withCorrelationId(() => {
				CorrelatedLogger.log('Test message', 'TestContext')
			})

			expect(log).toHaveBeenCalledWith('[test-correlation-id] Test message')
			expect(contextOfLastCall(log)).toBe('TestContext')
		})

		it('reuses one logger instance per context', () => {
			CorrelatedLogger.log('first', 'SharedContext')
			CorrelatedLogger.log('second', 'SharedContext')

			expect(log.mock.contexts[0]).toBe(log.mock.contexts[1])
		})
	})

	describe('error', () => {
		it('passes only the message when there is no trace', () => {
			withCorrelationId(() => {
				CorrelatedLogger.error('Error message')
			})

			expect(error).toHaveBeenCalledWith('[test-correlation-id] Error message')
			expect(contextOfLastCall(error)).toBe('CorrelatedLogger')
		})

		it('passes the trace as the second argument and the context via the instance', () => {
			withCorrelationId(() => {
				CorrelatedLogger.error('Error message', 'Stack trace here', 'ErrorContext')
			})

			expect(error).toHaveBeenCalledWith('[test-correlation-id] Error message', 'Stack trace here')
			expect(contextOfLastCall(error)).toBe('ErrorContext')
		})

		it('logs the bare message outside a request context', () => {
			CorrelatedLogger.error('Error message')

			expect(error).toHaveBeenCalledWith('Error message')
		})
	})

	describe('warn', () => {
		it('prefixes the correlation id', () => {
			withCorrelationId(() => {
				CorrelatedLogger.warn('Warning message')
			})

			expect(warn).toHaveBeenCalledWith('[test-correlation-id] Warning message')
		})

		it('uses the given context', () => {
			withCorrelationId(() => {
				CorrelatedLogger.warn('Warning message', 'WarnContext')
			})

			expect(warn).toHaveBeenCalledWith('[test-correlation-id] Warning message')
			expect(contextOfLastCall(warn)).toBe('WarnContext')
		})
	})

	describe('debug', () => {
		it('prefixes the correlation id', () => {
			withCorrelationId(() => {
				CorrelatedLogger.debug('Debug message')
			})

			expect(debug).toHaveBeenCalledWith('[test-correlation-id] Debug message')
		})

		it('uses the given context', () => {
			withCorrelationId(() => {
				CorrelatedLogger.debug('Debug message', 'DebugContext')
			})

			expect(debug).toHaveBeenCalledWith('[test-correlation-id] Debug message')
			expect(contextOfLastCall(debug)).toBe('DebugContext')
		})
	})
})
