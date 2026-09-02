import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CircuitBreaker, CircuitState } from '#microservice/HTTP/utils/circuit-breaker'

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

	describe('half-open canary gate (allowRequest)', () => {
		beforeEach(() => {
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		function tripAndEnterHalfOpen(): void {
			for (let i = 0; i < 5; i++) {
				circuitBreaker.recordFailure()
			}
			expect(circuitBreaker.getState()).toBe(CircuitState.OPEN)
			vi.advanceTimersByTime(1000)
		}

		it('allows exactly one caller through as the canary and rejects concurrent callers', () => {
			tripAndEnterHalfOpen()

			// First caller becomes the canary trial.
			expect(circuitBreaker.allowRequest()).toBe(true)
			expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN)

			// Every other concurrent caller is rejected while the trial is in flight —
			// this is the thundering-herd guard: before this fix, isOpen() returned
			// false (allowed) for ALL of these once the state flipped to HALF_OPEN.
			expect(circuitBreaker.allowRequest()).toBe(false)
			expect(circuitBreaker.allowRequest()).toBe(false)
			expect(circuitBreaker.allowRequest()).toBe(false)
		})

		it('allows a new trial after the canary succeeds', () => {
			tripAndEnterHalfOpen()

			expect(circuitBreaker.allowRequest()).toBe(true)
			expect(circuitBreaker.allowRequest()).toBe(false)

			circuitBreaker.recordSuccess()
			expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED)

			// Circuit is closed again — normal traffic flows without claiming.
			expect(circuitBreaker.allowRequest()).toBe(true)
			expect(circuitBreaker.allowRequest()).toBe(true)
		})

		it('re-opens and rejects everyone when the canary fails, then allows exactly one new canary after the next reset timeout', () => {
			tripAndEnterHalfOpen()

			expect(circuitBreaker.allowRequest()).toBe(true)
			circuitBreaker.recordFailure()
			expect(circuitBreaker.getState()).toBe(CircuitState.OPEN)

			// Circuit re-opened — no one is allowed through until the next reset timeout.
			expect(circuitBreaker.allowRequest()).toBe(false)

			vi.advanceTimersByTime(1000)

			// Fresh half-open episode: exactly one new canary is allowed again.
			expect(circuitBreaker.allowRequest()).toBe(true)
			expect(circuitBreaker.allowRequest()).toBe(false)
		})

		it('releaseHalfOpenTrial() frees the slot without affecting failure/success statistics', () => {
			tripAndEnterHalfOpen()

			expect(circuitBreaker.allowRequest()).toBe(true)
			expect(circuitBreaker.allowRequest()).toBe(false)

			circuitBreaker.releaseHalfOpenTrial()

			// Still half-open (statistics untouched), but the slot is free again —
			// this is the safety net HttpClientService relies on for outcomes that
			// don't call recordSuccess()/recordFailure() (e.g. a filtered-out 4xx).
			expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN)
			expect(circuitBreaker.allowRequest()).toBe(true)
		})

		it('isOpen() does not claim the canary slot (safe for status polling)', () => {
			tripAndEnterHalfOpen()

			// Repeated pure status reads must never consume the trial slot.
			expect(circuitBreaker.isOpen()).toBe(false)
			expect(circuitBreaker.isOpen()).toBe(false)
			expect(circuitBreaker.isOpen()).toBe(false)

			// A real request can still claim it afterwards.
			expect(circuitBreaker.allowRequest()).toBe(true)
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
