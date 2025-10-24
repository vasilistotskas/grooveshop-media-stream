import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('correlatedLogger', () => {
	let mockCorrelationService: {
		getCorrelationId: ReturnType<typeof vi.fn>
	}
	let consoleSpy: {
		log: ReturnType<typeof vi.spyOn>
		error: ReturnType<typeof vi.spyOn>
		warn: ReturnType<typeof vi.spyOn>
		debug: ReturnType<typeof vi.spyOn>
	}

	beforeEach(() => {
		// Setup console spies
		consoleSpy = {
			log: vi.spyOn(console, 'log').mockImplementation(() => {}),
			error: vi.spyOn(console, 'error').mockImplementation(() => {}),
			warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
			debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
		}

		// Create mock correlation service with vi.fn()
		mockCorrelationService = {
			getCorrelationId: vi.fn(),
		}

		// Mock the static correlation service instance
		CorrelatedLogger.setCorrelationService(mockCorrelationService as any)
	})

	afterEach(() => {
		Object.values(consoleSpy).forEach(spy => spy.mockRestore())
	})

	describe('log', () => {
		it('should log with correlation ID when available', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id')

			CorrelatedLogger.log('Test message')

			expect(consoleSpy.log).toHaveBeenCalledWith('[test-correlation-id] Test message')
		})

		it('should log without correlation ID when not available', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue(null)

			CorrelatedLogger.log('Test message')

			expect(consoleSpy.log).toHaveBeenCalledWith(' Test message')
		})

		it('should include context when provided', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id')

			CorrelatedLogger.log('Test message', 'TestContext')

			expect(consoleSpy.log).toHaveBeenCalledWith('[test-correlation-id] [TestContext] Test message')
		})

		it('should handle missing correlation ID and context', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue(null)

			CorrelatedLogger.log('Test message', 'TestContext')

			expect(consoleSpy.log).toHaveBeenCalledWith(' [TestContext] Test message')
		})
	})

	describe('error', () => {
		it('should log error with correlation ID', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id')

			CorrelatedLogger.error('Error message')

			expect(consoleSpy.error).toHaveBeenCalledWith('[test-correlation-id] ERROR: Error message')
		})

		it('should log error with trace when provided', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id')

			CorrelatedLogger.error('Error message', 'Stack trace here', 'ErrorContext')

			expect(consoleSpy.error).toHaveBeenCalledWith('[test-correlation-id] [ErrorContext] ERROR: Error message')
			expect(consoleSpy.error).toHaveBeenCalledWith('[test-correlation-id] [ErrorContext] TRACE: Stack trace here')
		})

		it('should handle missing correlation ID', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue(null)

			CorrelatedLogger.error('Error message')

			expect(consoleSpy.error).toHaveBeenCalledWith(' ERROR: Error message')
		})
	})

	describe('warn', () => {
		it('should log warning with correlation ID', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id')

			CorrelatedLogger.warn('Warning message')

			expect(consoleSpy.warn).toHaveBeenCalledWith('[test-correlation-id] WARN: Warning message')
		})

		it('should log warning with context', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id')

			CorrelatedLogger.warn('Warning message', 'WarnContext')

			expect(consoleSpy.warn).toHaveBeenCalledWith('[test-correlation-id] [WarnContext] WARN: Warning message')
		})
	})

	describe('debug', () => {
		it('should log debug message with correlation ID', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id')

			CorrelatedLogger.debug('Debug message')

			expect(consoleSpy.debug).toHaveBeenCalledWith('[test-correlation-id] DEBUG: Debug message')
		})

		it('should log debug message with context', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id')

			CorrelatedLogger.debug('Debug message', 'DebugContext')

			expect(consoleSpy.debug).toHaveBeenCalledWith('[test-correlation-id] [DebugContext] DEBUG: Debug message')
		})
	})

	describe('verbose', () => {
		it('should log verbose message with correlation ID', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id')

			CorrelatedLogger.verbose('Verbose message')

			expect(consoleSpy.log).toHaveBeenCalledWith('[test-correlation-id] VERBOSE: Verbose message')
		})

		it('should log verbose message with context', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id')

			CorrelatedLogger.verbose('Verbose message', 'VerboseContext')

			expect(consoleSpy.log).toHaveBeenCalledWith('[test-correlation-id] [VerboseContext] VERBOSE: Verbose message')
		})
	})
})
