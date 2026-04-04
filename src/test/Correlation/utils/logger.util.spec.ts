import type { RequestContext } from '#microservice/Correlation/interfaces/correlation.interface'
import { requestContextStorage } from '#microservice/Correlation/async-local-storage'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('correlatedLogger', () => {
	let loggerSpy: {
		log: ReturnType<typeof vi.spyOn>
		error: ReturnType<typeof vi.spyOn>
		warn: ReturnType<typeof vi.spyOn>
		debug: ReturnType<typeof vi.spyOn>
		verbose: ReturnType<typeof vi.spyOn>
	}

	beforeEach(() => {
		loggerSpy = {
			log: vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {}),
			error: vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {}),
			warn: vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}),
			debug: vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {}),
			verbose: vi.spyOn(Logger.prototype, 'verbose').mockImplementation(() => {}),
		}
	})

	afterEach(() => {
		Object.values(loggerSpy).forEach(spy => spy.mockRestore())
	})

	describe('log', () => {
		it('should log with correlation ID when available', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.log('Test message')

				expect(loggerSpy.log).toHaveBeenCalledWith('[test-correlation-id] Test message', undefined)
			})
		})

		it('should log without correlation ID when not available', () => {
			CorrelatedLogger.log('Test message')

			expect(loggerSpy.log).toHaveBeenCalledWith('Test message', undefined)
		})

		it('should include context when provided', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.log('Test message', 'TestContext')

				expect(loggerSpy.log).toHaveBeenCalledWith('[test-correlation-id] Test message', 'TestContext')
			})
		})

		it('should handle missing correlation ID and context', () => {
			CorrelatedLogger.log('Test message', 'TestContext')

			expect(loggerSpy.log).toHaveBeenCalledWith('Test message', 'TestContext')
		})
	})

	describe('error', () => {
		it('should log error with correlation ID', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.error('Error message')

				expect(loggerSpy.error).toHaveBeenCalledWith('[test-correlation-id] Error message', undefined, undefined)
			})
		})

		it('should log error with trace when provided', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.error('Error message', 'Stack trace here', 'ErrorContext')

				expect(loggerSpy.error).toHaveBeenCalledWith('[test-correlation-id] Error message', 'Stack trace here', 'ErrorContext')
			})
		})

		it('should handle missing correlation ID', () => {
			CorrelatedLogger.error('Error message')

			expect(loggerSpy.error).toHaveBeenCalledWith('Error message', undefined, undefined)
		})
	})

	describe('warn', () => {
		it('should log warning with correlation ID', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.warn('Warning message')

				expect(loggerSpy.warn).toHaveBeenCalledWith('[test-correlation-id] Warning message', undefined)
			})
		})

		it('should log warning with context', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.warn('Warning message', 'WarnContext')

				expect(loggerSpy.warn).toHaveBeenCalledWith('[test-correlation-id] Warning message', 'WarnContext')
			})
		})
	})

	describe('debug', () => {
		it('should log debug message with correlation ID', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.debug('Debug message')

				expect(loggerSpy.debug).toHaveBeenCalledWith('[test-correlation-id] Debug message', undefined)
			})
		})

		it('should log debug message with context', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.debug('Debug message', 'DebugContext')

				expect(loggerSpy.debug).toHaveBeenCalledWith('[test-correlation-id] Debug message', 'DebugContext')
			})
		})
	})

	describe('verbose', () => {
		it('should log verbose message with correlation ID', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.verbose('Verbose message')

				expect(loggerSpy.verbose).toHaveBeenCalledWith('[test-correlation-id] Verbose message', undefined)
			})
		})

		it('should log verbose message with context', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.verbose('Verbose message', 'VerboseContext')

				expect(loggerSpy.verbose).toHaveBeenCalledWith('[test-correlation-id] Verbose message', 'VerboseContext')
			})
		})
	})
})
