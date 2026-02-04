import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the CorrelatedLogger
vi.mock('#microservice/Correlation/utils/logger.util', () => ({
	CorrelatedLogger: {
		debug: vi.fn(),
		warn: vi.fn(),
		log: vi.fn(),
	},
}))

// Create mock correlation service instance
const mockCorrelationService = {
	setContext: vi.fn(),
	getContext: vi.fn(),
	getCorrelationId: vi.fn(),
	updateContext: vi.fn(),
	clearContext: vi.fn(),
}

// Mock the CorrelationService class to return our mock instance
vi.mock('#microservice/Correlation/services/correlation.service', () => ({
	CorrelationService: vi.fn(function (this: any) {
		// Assign mock methods to 'this' for constructor call
		Object.assign(this, mockCorrelationService)
		return this
	}),
}))

describe('performanceTracker', () => {
	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks()

		// Ensure the mock returns the correlation ID consistently
		mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id')

		// Clear any existing phases by directly accessing the private phases map
		; (PerformanceTracker as any).phases = new Map()
	})

	afterEach(() => {
		// Clear phases directly since cleanup() also depends on correlation ID
		; (PerformanceTracker as any).phases = new Map()
		vi.clearAllMocks()
	})

	describe('phase Tracking', () => {
		it('should start and end a performance phase', () => {
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

		it('should handle phases with metadata', () => {
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

		it('should handle multiple phases', () => {
			PerformanceTracker.startPhase('phase-1')
			PerformanceTracker.startPhase('phase-2')
			PerformanceTracker.endPhase('phase-1')
			PerformanceTracker.endPhase('phase-2')

			const phases = PerformanceTracker.getPhases()
			expect(phases).toHaveLength(2)
			expect(phases.every(p => p.duration !== undefined)).toBe(true)
		})

		it('should handle nested phases with same name', () => {
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

	describe('performance Summary', () => {
		it('should provide accurate summary', () => {
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

		it('should return empty summary when no phases exist', () => {
			const summary = PerformanceTracker.getSummary()

			expect(summary.totalPhases).toBe(0)
			expect(summary.completedPhases).toBe(0)
			expect(summary.totalDuration).toBe(0)
			expect(summary.slowestPhase).toBeUndefined()
		})
	})

	describe('measure Function', () => {
		it('should measure synchronous function execution', async () => {
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

		it('should measure asynchronous function execution', async () => {
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

		it('should handle function errors', async () => {
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

	describe('method Decorator', () => {
		it('should create a working method decorator', async () => {
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

	describe('cleanup', () => {
		it('should clear all phases for current correlation', () => {
			PerformanceTracker.startPhase('phase-1')
			PerformanceTracker.startPhase('phase-2')

			expect(PerformanceTracker.getPhases()).toHaveLength(2)

			PerformanceTracker.cleanup()

			expect(PerformanceTracker.getPhases()).toHaveLength(0)
		})
	})

	describe('edge Cases', () => {
		it('should handle missing correlation context gracefully', () => {
			// Mock to return null correlation ID
			mockCorrelationService.getCorrelationId.mockReturnValue(null)

			PerformanceTracker.startPhase('no-context-phase')
			const duration = PerformanceTracker.endPhase('no-context-phase')

			expect(duration).toBeNull()
			expect(PerformanceTracker.getPhases()).toHaveLength(0)
		})

		it('should handle ending non-existent phase', () => {
			const duration = PerformanceTracker.endPhase('non-existent-phase')

			expect(duration).toBeNull()
		})

		it('should handle ending already ended phase', () => {
			PerformanceTracker.startPhase('test-phase')
			const duration1 = PerformanceTracker.endPhase('test-phase')
			const duration2 = PerformanceTracker.endPhase('test-phase')

			expect(duration1).toBeGreaterThan(0)
			expect(duration2).toBeNull()
		})
	})
})
