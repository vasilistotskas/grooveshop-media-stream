import { CircuitBreaker, CircuitState } from '@microservice/HTTP/utils/circuit-breaker'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('circuitBreaker', () => {
	let circuitBreaker: CircuitBreaker

	beforeEach(() => {
		vi.useFakeTimers()
		circuitBreaker = new CircuitBreaker({
			failureThreshold: 50,
			resetTimeout: 1000,
			rollingWindow: 5000,
			minimumRequests: 3,
		})
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe('initialization', () => {
		it('should start in closed state', () => {
			expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED)
			expect(circuitBreaker.isOpen()).toBe(false)
		})

		it('should initialize with default options', () => {
			const stats = circuitBreaker.getStats()
			expect(stats.state).toBe(CircuitState.CLOSED)
			expect(stats.failureCount).toBe(0)
			expect(stats.successCount).toBe(0)
			expect(stats.totalRequests).toBe(0)
		})
	})

	describe('success Recording', () => {
		it('should record successful requests', () => {
			circuitBreaker.recordSuccess()
			circuitBreaker.recordSuccess()

			const stats = circuitBreaker.getStats()
			expect(stats.successCount).toBe(2)
			expect(stats.failureCount).toBe(0)
			expect(stats.state).toBe(CircuitState.CLOSED)
		})

		it('should reset circuit breaker from half-open to closed on success', () => {
			// Force circuit to open state by recording enough failures
			for (let i = 0; i < 10; i++) {
				circuitBreaker.recordFailure()
			}

			// Verify circuit is open
			expect(circuitBreaker.getState()).toBe(CircuitState.OPEN)

			// Wait for reset timeout and check if circuit transitions to half-open
			vi.advanceTimersByTime(1000)
			const isOpen = circuitBreaker.isOpen() // This should transition to half-open
			expect(isOpen).toBe(false) // Should return false when in half-open state
			expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN)

			// Record success should close the circuit
			circuitBreaker.recordSuccess()

			expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED)
		})
	})

	describe('failure Recording', () => {
		it('should record failed requests', () => {
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()

			const stats = circuitBreaker.getStats()
			expect(stats.failureCount).toBe(2)
			expect(stats.successCount).toBe(0)
			expect(stats.state).toBe(CircuitState.CLOSED) // Still closed due to minimum requests
		})

		it('should trip circuit when failure threshold is exceeded', () => {
			// Record enough failures to exceed threshold
			for (let i = 0; i < 5; i++) {
				circuitBreaker.recordFailure()
			}

			const stats = circuitBreaker.getStats()
			expect(stats.state).toBe(CircuitState.OPEN)
			expect(circuitBreaker.isOpen()).toBe(true)
		})

		it('should not trip circuit with insufficient requests', () => {
			// Record only 2 failures (below minimum requests of 3)
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()

			expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED)
			expect(circuitBreaker.isOpen()).toBe(false)
		})
	})

	describe('circuit States', () => {
		beforeEach(() => {
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		it('should transition from open to half-open after reset timeout', () => {
			// Trip the circuit
			for (let i = 0; i < 5; i++) {
				circuitBreaker.recordFailure()
			}
			expect(circuitBreaker.getState()).toBe(CircuitState.OPEN)

			// Advance time to trigger half-open
			vi.advanceTimersByTime(1000)

			// Check if circuit transitions to half-open
			const isOpen = circuitBreaker.isOpen()
			expect(isOpen).toBe(false)
			expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN)
		})

		it('should reopen circuit on failure in half-open state', () => {
			// Trip the circuit
			for (let i = 0; i < 5; i++) {
				circuitBreaker.recordFailure()
			}

			// Wait for reset timeout
			vi.advanceTimersByTime(1000)
			circuitBreaker.isOpen() // Transition to half-open

			// Record failure in half-open state
			circuitBreaker.recordFailure()

			expect(circuitBreaker.getState()).toBe(CircuitState.OPEN)
		})
	})

	describe('execute Method', () => {
		it('should execute function when circuit is closed', async () => {
			const mockFn = vi.fn().mockResolvedValue('success')

			const result = await circuitBreaker.execute(mockFn)

			expect(result).toBe('success')
			expect(mockFn).toHaveBeenCalled()
		})

		it('should throw error when circuit is open and no fallback', async () => {
			// Trip the circuit
			for (let i = 0; i < 5; i++) {
				circuitBreaker.recordFailure()
			}

			const mockFn = vi.fn().mockResolvedValue('success')

			await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Circuit breaker is open')
			expect(mockFn).not.toHaveBeenCalled()
		})

		it('should use fallback when circuit is open', async () => {
			// Trip the circuit
			for (let i = 0; i < 5; i++) {
				circuitBreaker.recordFailure()
			}

			const mockFn = vi.fn().mockResolvedValue('success')
			const fallbackFn = vi.fn().mockResolvedValue('fallback')

			const result = await circuitBreaker.execute(mockFn, fallbackFn)

			expect(result).toBe('fallback')
			expect(mockFn).not.toHaveBeenCalled()
			expect(fallbackFn).toHaveBeenCalled()
		})

		it('should record success when function succeeds', async () => {
			const mockFn = vi.fn().mockResolvedValue('success')

			await circuitBreaker.execute(mockFn)

			const stats = circuitBreaker.getStats()
			expect(stats.successCount).toBe(1)
			expect(stats.totalRequests).toBe(1)
		})

		it('should record failure when function throws', async () => {
			const mockFn = vi.fn().mockRejectedValue(new Error('test error'))

			await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error')

			const stats = circuitBreaker.getStats()
			expect(stats.failureCount).toBe(1)
			expect(stats.totalRequests).toBe(1)
		})

		it('should use fallback when function throws and fallback is provided', async () => {
			const mockFn = vi.fn().mockRejectedValue(new Error('test error'))
			const fallbackFn = vi.fn().mockResolvedValue('fallback')

			const result = await circuitBreaker.execute(mockFn, fallbackFn)

			expect(result).toBe('fallback')
			expect(fallbackFn).toHaveBeenCalled()
		})
	})

	describe('statistics and Reset', () => {
		it('should provide accurate statistics', () => {
			circuitBreaker.recordSuccess()
			circuitBreaker.recordSuccess()
			circuitBreaker.recordFailure()

			const stats = circuitBreaker.getStats()
			expect(stats.successCount).toBe(2)
			expect(stats.failureCount).toBe(1)
			expect(stats.totalRequests).toBe(3)
			expect(stats.failurePercentage).toBeCloseTo(33.33, 1)
		})

		it('should reset all statistics', () => {
			circuitBreaker.recordSuccess()
			circuitBreaker.recordFailure()

			circuitBreaker.reset()

			const stats = circuitBreaker.getStats()
			expect(stats.successCount).toBe(0)
			expect(stats.failureCount).toBe(0)
			expect(stats.totalRequests).toBe(0)
			expect(stats.state).toBe(CircuitState.CLOSED)
		})
	})

	describe('rolling Window', () => {
		beforeEach(() => {
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		it('should prune old entries from rolling window', () => {
			// Record some failures
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()

			// Advance time beyond rolling window
			vi.advanceTimersByTime(6000) // Beyond 5000ms rolling window

			// Record more failures
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()

			const stats = circuitBreaker.getStats()
			// Should only count recent failures due to window pruning
			expect(stats.failurePercentage).toBe(100) // Only recent failures count
		})
	})
})
