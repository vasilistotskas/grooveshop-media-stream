import type { RequestContext } from '#microservice/Correlation/interfaces/correlation.interface'
import { requestContextStorage } from '#microservice/Correlation/async-local-storage'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// NO mock of CorrelatedLogger — we use the real logger and spy on console methods
// to catch integration issues like detached method references losing `this` binding.

const TEST_CORRELATION_ID = 'test-correlation-id'

function createTestContext(overrides?: Partial<RequestContext>): RequestContext {
	return {
		correlationId: TEST_CORRELATION_ID,
		timestamp: Date.now(),
		clientIp: '127.0.0.1',
		method: 'GET',
		url: '/test',
		startTime: process.hrtime.bigint(),
		...overrides,
	}
}

/**
 * Run a callback within a requestContextStorage context.
 * This simulates what the correlation middleware does for real requests.
 */
function runWithContext<T>(fn: () => T, context?: RequestContext): T {
	return requestContextStorage.run(context ?? createTestContext(), fn)
}

describe('performanceTracker', () => {
	let consoleSpy: {
		log: ReturnType<typeof vi.spyOn>
		error: ReturnType<typeof vi.spyOn>
		warn: ReturnType<typeof vi.spyOn>
		debug: ReturnType<typeof vi.spyOn>
	}

	beforeEach(() => {
		// Clear any existing phases by directly accessing the private phases map
		;(PerformanceTracker as any).phases = new Map()

		// Spy on console methods (NOT mock CorrelatedLogger)
		// This ensures the real CorrelatedLogger is exercised end-to-end
		consoleSpy = {
			log: vi.spyOn(console, 'log').mockImplementation(() => {}),
			error: vi.spyOn(console, 'error').mockImplementation(() => {}),
			warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
			debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
		}
	})

	afterEach(() => {
		// Clear phases directly since cleanup() also depends on correlation ID
		;(PerformanceTracker as any).phases = new Map()
		Object.values(consoleSpy).forEach(spy => spy.mockRestore())
		vi.clearAllMocks()
	})

	describe('phase Tracking', () => {
		it('should start and end a performance phase', () => {
			runWithContext(() => {
				PerformanceTracker.startPhase('test-phase')

				const phases = PerformanceTracker.getPhases()
				expect(phases).toHaveLength(1)
				expect(phases[0].name).toBe('test-phase')
				expect(phases[0].startTime).toBeDefined()
				expect(phases[0].endTime).toBeUndefined()

				const duration = PerformanceTracker.endPhase('test-phase')

				expect(duration).toBeGreaterThan(0)
				expect(phases[0].endTime).toBeDefined()
				expect(phases[0].duration).toBeDefined()
			})
		})

		it('should call real CorrelatedLogger.debug on startPhase and endPhase', () => {
			runWithContext(() => {
				PerformanceTracker.startPhase('test-phase')

				// Real CorrelatedLogger.debug was called (not a mock)
				expect(consoleSpy.debug).toHaveBeenCalledWith(
					expect.stringContaining('Performance phase started: test-phase'),
				)

				PerformanceTracker.endPhase('test-phase')

				// endPhase also calls real CorrelatedLogger.debug for fast operations
				expect(consoleSpy.debug).toHaveBeenCalledWith(
					expect.stringContaining('Performance phase completed: test-phase'),
				)
			})
		})

		it('should handle phases with metadata', () => {
			runWithContext(() => {
				const metadata = { operation: 'image-resize', size: '1024x768' }

				PerformanceTracker.startPhase('resize-phase', metadata)
				PerformanceTracker.endPhase('resize-phase', { result: 'success' })

				const phases = PerformanceTracker.getPhases()
				expect(phases[0].metadata).toEqual({
					operation: 'image-resize',
					size: '1024x768',
					result: 'success',
				})
			})
		})

		it('should handle multiple phases', () => {
			runWithContext(() => {
				PerformanceTracker.startPhase('phase-1')
				PerformanceTracker.startPhase('phase-2')
				PerformanceTracker.endPhase('phase-1')
				PerformanceTracker.endPhase('phase-2')

				const phases = PerformanceTracker.getPhases()
				expect(phases).toHaveLength(2)
				expect(phases.every(p => p.duration !== undefined)).toBe(true)
			})
		})

		it('should handle nested phases with same name', () => {
			runWithContext(() => {
				PerformanceTracker.startPhase('nested-phase')
				PerformanceTracker.startPhase('nested-phase')

				const duration1 = PerformanceTracker.endPhase('nested-phase')
				const duration2 = PerformanceTracker.endPhase('nested-phase')

				expect(duration1).toBeGreaterThan(0)
				expect(duration2).toBeGreaterThan(0)

				const phases = PerformanceTracker.getPhases()
				expect(phases).toHaveLength(2)
				expect(phases.every(p => p.name === 'nested-phase')).toBe(true)
			})
		})
	})

	describe('slow Operation Threshold', () => {
		it('should log warn for operations exceeding 1000ms', () => {
			runWithContext(() => {
				PerformanceTracker.startPhase('slow-phase')

				// Manually set the start time far in the past to simulate a slow operation
				const phases = PerformanceTracker.getPhases()
				// Set startTime to 2 seconds ago
				phases[0].startTime = process.hrtime.bigint() - BigInt(2_000_000_000)

				PerformanceTracker.endPhase('slow-phase')

				// Should use warn (not debug) for operations >1000ms
				expect(consoleSpy.warn).toHaveBeenCalledWith(
					expect.stringContaining('Performance phase completed: slow-phase'),
				)
				// debug should NOT have been called for the completion log
				const debugCalls = consoleSpy.debug.mock.calls.filter(
					(call: any[]) => typeof call[0] === 'string' && call[0].includes('Performance phase completed'),
				)
				expect(debugCalls).toHaveLength(0)
			})
		})

		it('should log debug for fast operations under 1000ms', () => {
			runWithContext(() => {
				PerformanceTracker.startPhase('fast-phase')
				PerformanceTracker.endPhase('fast-phase')

				// Should use debug (not warn)
				expect(consoleSpy.debug).toHaveBeenCalledWith(
					expect.stringContaining('Performance phase completed: fast-phase'),
				)
				// warn should NOT have been called for completion
				const warnCalls = consoleSpy.warn.mock.calls.filter(
					(call: any[]) => typeof call[0] === 'string' && call[0].includes('Performance phase completed'),
				)
				expect(warnCalls).toHaveLength(0)
			})
		})

		it('should include correlation ID prefix in log output', () => {
			runWithContext(() => {
				PerformanceTracker.startPhase('prefixed-phase')

				expect(consoleSpy.debug).toHaveBeenCalledWith(
					expect.stringContaining(`[${TEST_CORRELATION_ID}]`),
				)
			})
		})
	})

	describe('performance Summary', () => {
		it('should provide accurate summary', () => {
			runWithContext(() => {
				PerformanceTracker.startPhase('phase-1')
				PerformanceTracker.startPhase('phase-2')
				PerformanceTracker.endPhase('phase-1')
				// Leave phase-2 incomplete

				const summary = PerformanceTracker.getSummary()

				expect(summary.totalPhases).toBe(2)
				expect(summary.completedPhases).toBe(1)
				expect(summary.totalDuration).toBeGreaterThan(0)
				expect(summary.slowestPhase?.name).toBe('phase-1')
			})
		})

		it('should return empty summary when no phases exist', () => {
			runWithContext(() => {
				const summary = PerformanceTracker.getSummary()

				expect(summary.totalPhases).toBe(0)
				expect(summary.completedPhases).toBe(0)
				expect(summary.totalDuration).toBe(0)
				expect(summary.slowestPhase).toBeUndefined()
			})
		})

		it('should log summary via real CorrelatedLogger', () => {
			runWithContext(() => {
				PerformanceTracker.startPhase('summary-phase')
				PerformanceTracker.endPhase('summary-phase')

				PerformanceTracker.logSummary()

				expect(consoleSpy.log).toHaveBeenCalledWith(
					expect.stringContaining('Performance Summary:'),
				)
			})
		})

		it('should not log summary when no phases exist', () => {
			runWithContext(() => {
				consoleSpy.log.mockClear()
				PerformanceTracker.logSummary()

				const summaryCalls = consoleSpy.log.mock.calls.filter(
					(call: any[]) => typeof call[0] === 'string' && call[0].includes('Performance Summary'),
				)
				expect(summaryCalls).toHaveLength(0)
			})
		})
	})

	describe('measure Function', () => {
		it('should measure synchronous function execution', async () => {
			await runWithContext(async () => {
				const testFn = () => {
					// Simulate some work
					const start = Date.now()
					while (Date.now() - start < 10) {
						// Busy wait for 10ms
					}
					return 'result'
				}

				const result = await PerformanceTracker.measure('sync-test', testFn)

				expect(result).toBe('result')

				const phases = PerformanceTracker.getPhases()
				expect(phases).toHaveLength(1)
				expect(phases[0].name).toBe('sync-test')
				expect(phases[0].duration).toBeGreaterThan(0)
				expect(phases[0].metadata?.success).toBe(true)
			})
		})

		it('should measure asynchronous function execution', async () => {
			await runWithContext(async () => {
				const testFn = async () => {
					await new Promise(resolve => setTimeout(resolve, 10))
					return 'async-result'
				}

				const result = await PerformanceTracker.measure('async-test', testFn)

				expect(result).toBe('async-result')

				const phases = PerformanceTracker.getPhases()
				expect(phases).toHaveLength(1)
				expect(phases[0].name).toBe('async-test')
				expect(phases[0].duration).toBeGreaterThan(0)
				expect(phases[0].metadata?.success).toBe(true)
			})
		})

		it('should handle function errors', async () => {
			await runWithContext(async () => {
				const testFn = () => {
					throw new Error('Test error')
				}

				await expect(
					PerformanceTracker.measure('error-test', testFn),
				).rejects.toThrow('Test error')

				const phases = PerformanceTracker.getPhases()
				expect(phases).toHaveLength(1)
				expect(phases[0].name).toBe('error-test')
				expect(phases[0].duration).toBeGreaterThan(0)
				expect(phases[0].metadata?.success).toBe(false)
				expect(phases[0].metadata?.error).toBe('Test error')
			})
		})
	})

	describe('method Decorator', () => {
		it('should create a working method decorator', async () => {
			await runWithContext(async () => {
				class TestClass {
					@PerformanceTracker.measureMethod('decorated-method')
					async testMethod(value: string): Promise<string> {
						await new Promise(resolve => setTimeout(resolve, 10))
						return `processed-${value}`
					}
				}

				const instance = new TestClass()
				const result = await instance.testMethod('test')

				expect(result).toBe('processed-test')

				const phases = PerformanceTracker.getPhases()
				expect(phases).toHaveLength(1)
				expect(phases[0].name).toBe('decorated-method')
				expect(phases[0].duration).toBeGreaterThan(0)
			})
		})

		it('should auto-generate phase name from class and method', async () => {
			await runWithContext(async () => {
				class MyService {
					@PerformanceTracker.measureMethod()
					async processImage(): Promise<string> {
						return 'done'
					}
				}

				const instance = new MyService()
				await instance.processImage()

				const phases = PerformanceTracker.getPhases()
				expect(phases).toHaveLength(1)
				expect(phases[0].name).toBe('MyService.processImage')
			})
		})
	})

	describe('cleanup', () => {
		it('should clear all phases for current correlation', () => {
			runWithContext(() => {
				PerformanceTracker.startPhase('phase-1')
				PerformanceTracker.startPhase('phase-2')

				expect(PerformanceTracker.getPhases()).toHaveLength(2)

				PerformanceTracker.cleanup()

				expect(PerformanceTracker.getPhases()).toHaveLength(0)
			})
		})

		it('should clean up by explicit correlation ID', () => {
			runWithContext(() => {
				PerformanceTracker.startPhase('phase-1')
			})

			// Call cleanup with explicit ID outside the context
			PerformanceTracker.cleanup(TEST_CORRELATION_ID)

			// Verify phases are cleaned up
			runWithContext(() => {
				expect(PerformanceTracker.getPhases()).toHaveLength(0)
			})
		})

		it('should be a no-op when no correlation context exists', () => {
			// No requestContextStorage.run() — no active request context
			expect(() => PerformanceTracker.cleanup()).not.toThrow()
		})
	})

	describe('edge Cases', () => {
		it('should handle missing correlation context gracefully', () => {
			// No requestContextStorage.run() — simulates no active request context
			PerformanceTracker.startPhase('no-context-phase')
			const duration = PerformanceTracker.endPhase('no-context-phase')

			expect(duration).toBeNull()
			expect(PerformanceTracker.getPhases()).toHaveLength(0)
		})

		it('should handle ending non-existent phase when no phases tracked', () => {
			runWithContext(() => {
				const duration = PerformanceTracker.endPhase('non-existent-phase')

				// Returns null because no phases exist for this correlation ID
				expect(duration).toBeNull()
			})
		})

		it('should warn when ending a phase name not found among existing phases', () => {
			runWithContext(() => {
				// Start a different phase so the correlation has phases registered
				PerformanceTracker.startPhase('existing-phase')

				const duration = PerformanceTracker.endPhase('non-existent-phase')

				expect(duration).toBeNull()
				// Now the warn is triggered because phases exist but the name wasn't found
				expect(consoleSpy.warn).toHaveBeenCalledWith(
					expect.stringContaining('Performance phase not found or already ended: non-existent-phase'),
				)
			})
		})

		it('should handle ending already ended phase', () => {
			runWithContext(() => {
				PerformanceTracker.startPhase('test-phase')
				const duration1 = PerformanceTracker.endPhase('test-phase')
				const duration2 = PerformanceTracker.endPhase('test-phase')

				expect(duration1).toBeGreaterThan(0)
				expect(duration2).toBeNull()
			})
		})

		it('should isolate phases between different correlation IDs', () => {
			const context1 = createTestContext({ correlationId: 'ctx-1' })
			const context2 = createTestContext({ correlationId: 'ctx-2' })

			runWithContext(() => {
				PerformanceTracker.startPhase('phase-in-ctx1')
			}, context1)

			runWithContext(() => {
				PerformanceTracker.startPhase('phase-in-ctx2')
				const phases = PerformanceTracker.getPhases()
				expect(phases).toHaveLength(1)
				expect(phases[0].name).toBe('phase-in-ctx2')
			}, context2)

			runWithContext(() => {
				const phases = PerformanceTracker.getPhases()
				expect(phases).toHaveLength(1)
				expect(phases[0].name).toBe('phase-in-ctx1')
			}, context1)
		})

		it('should handle getPhases/getSummary without context', () => {
			expect(PerformanceTracker.getPhases()).toHaveLength(0)

			const summary = PerformanceTracker.getSummary()
			expect(summary.totalPhases).toBe(0)
			expect(summary.completedPhases).toBe(0)
		})
	})
})
