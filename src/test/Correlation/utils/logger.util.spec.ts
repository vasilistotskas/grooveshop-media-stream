import type { RequestContext } from '#microservice/Correlation/interfaces/correlation.interface'
import { requestContextStorage } from '#microservice/Correlation/async-local-storage'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
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
	let consoleSpy: {
		log: ReturnType<typeof vi.spyOn>
		error: ReturnType<typeof vi.spyOn>
		warn: ReturnType<typeof vi.spyOn>
		debug: ReturnType<typeof vi.spyOn>
	}

	beforeEach(() => {
		consoleSpy = {
			log: vi.spyOn(console, 'log').mockImplementation(() => {}),
			error: vi.spyOn(console, 'error').mockImplementation(() => {}),
			warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
			debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
		}
	})

	afterEach(() => {
		Object.values(consoleSpy).forEach(spy => spy.mockRestore())
	})

	describe('log', () => {
		it('should log with correlation ID when available', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.log('Test message')

				expect(consoleSpy.log).toHaveBeenCalledWith('[test-correlation-id] Test message')
			})
		})

		it('should log without correlation ID when not available', () => {
			CorrelatedLogger.log('Test message')

			expect(consoleSpy.log).toHaveBeenCalledWith(' Test message')
		})

		it('should include context when provided', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.log('Test message', 'TestContext')

				expect(consoleSpy.log).toHaveBeenCalledWith('[test-correlation-id] [TestContext] Test message')
			})
		})

		it('should handle missing correlation ID and context', () => {
			CorrelatedLogger.log('Test message', 'TestContext')

			expect(consoleSpy.log).toHaveBeenCalledWith(' [TestContext] Test message')
		})
	})

	describe('error', () => {
		it('should log error with correlation ID', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.error('Error message')

				expect(consoleSpy.error).toHaveBeenCalledWith('[test-correlation-id] ERROR: Error message')
			})
		})

		it('should log error with trace when provided', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.error('Error message', 'Stack trace here', 'ErrorContext')

				expect(consoleSpy.error).toHaveBeenCalledWith('[test-correlation-id] [ErrorContext] ERROR: Error message')
				expect(consoleSpy.error).toHaveBeenCalledWith('[test-correlation-id] [ErrorContext] TRACE: Stack trace here')
			})
		})

		it('should handle missing correlation ID', () => {
			CorrelatedLogger.error('Error message')

			expect(consoleSpy.error).toHaveBeenCalledWith(' ERROR: Error message')
		})
	})

	describe('warn', () => {
		it('should log warning with correlation ID', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.warn('Warning message')

				expect(consoleSpy.warn).toHaveBeenCalledWith('[test-correlation-id] WARN: Warning message')
			})
		})

		it('should log warning with context', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.warn('Warning message', 'WarnContext')

				expect(consoleSpy.warn).toHaveBeenCalledWith('[test-correlation-id] [WarnContext] WARN: Warning message')
			})
		})
	})

	describe('debug', () => {
		it('should log debug message with correlation ID', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.debug('Debug message')

				expect(consoleSpy.debug).toHaveBeenCalledWith('[test-correlation-id] DEBUG: Debug message')
			})
		})

		it('should log debug message with context', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.debug('Debug message', 'DebugContext')

				expect(consoleSpy.debug).toHaveBeenCalledWith('[test-correlation-id] [DebugContext] DEBUG: Debug message')
			})
		})
	})

	describe('verbose', () => {
		it('should log verbose message with correlation ID', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.verbose('Verbose message')

				expect(consoleSpy.log).toHaveBeenCalledWith('[test-correlation-id] VERBOSE: Verbose message')
			})
		})

		it('should log verbose message with context', () => {
			requestContextStorage.run(createRequestContext('test-correlation-id'), () => {
				CorrelatedLogger.verbose('Verbose message', 'VerboseContext')

				expect(consoleSpy.log).toHaveBeenCalledWith('[test-correlation-id] [VerboseContext] VERBOSE: Verbose message')
			})
		})
	})
})
