import { errorMessage } from '#microservice/common/utils/error-message.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

export enum CircuitState {
	CLOSED = 'closed',
	OPEN = 'open',
	HALF_OPEN = 'half-open',
}

export interface CircuitBreakerOptions {
	failureThreshold: number
	resetTimeout: number
	rollingWindow: number
	minimumRequests: number
	persistState?: (state: CircuitBreakerPersistedState) => Promise<void>
	loadState?: () => Promise<CircuitBreakerPersistedState | null>
}

const PERSISTENCE_INTERVAL_MS = 10000

export interface CircuitBreakerPersistedState {
	state: CircuitState
	failureCount: number
	successCount: number
	lastStateChange: number
	nextAttempt: number
}

export class CircuitBreaker {
	private state: CircuitState = CircuitState.CLOSED
	private failureCount = 0
	private successCount = 0
	private lastStateChange: number = Date.now()
	private nextAttempt: number = 0
	private totalRequests = 0
	private readonly options: CircuitBreakerOptions
	private readonly requestWindow: Array<{ timestamp: number, success: boolean }> = []
	private windowFailureCount = 0
	private persistenceTimer?: NodeJS.Timeout
	// HALF_OPEN canary gate: exactly one in-flight "trial" request is allowed
	// through while recovering; every other concurrent caller is rejected
	// until the trial settles. See allowRequest()/releaseHalfOpenTrial().
	private halfOpenTrialInFlight = false

	constructor(options: CircuitBreakerOptions) {
		this.options = options
	}

	/**
	 * Restore persisted state and start the periodic persistence timer.
	 * Must be awaited by the owner (e.g. from onModuleInit) so state
	 * restoration completes before the breaker serves traffic.
	 */
	async init(): Promise<void> {
		await this.loadPersistedState()

		if (this.options.persistState && !this.persistenceTimer) {
			this.persistenceTimer = setInterval(() => this.persistCurrentState(), PERSISTENCE_INTERVAL_MS)
			this.persistenceTimer.unref()
		}
	}

	/**
	 * Load persisted state from storage
	 */
	private async loadPersistedState(): Promise<void> {
		if (!this.options.loadState) {
			return
		}

		try {
			const persisted = await this.options.loadState()
			if (persisted) {
				// Only restore if the state is still relevant (not too old)
				const stateAge = Date.now() - persisted.lastStateChange
				if (stateAge < this.options.resetTimeout * 2) {
					this.state = persisted.state
					this.failureCount = persisted.failureCount
					this.successCount = persisted.successCount
					this.lastStateChange = persisted.lastStateChange
					this.nextAttempt = persisted.nextAttempt

					CorrelatedLogger.log(
						`Circuit breaker state restored: ${this.state} (age: ${stateAge}ms)`,
						'CircuitBreaker',
					)
				}
			}
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(
				`Failed to load circuit breaker state: ${errorMessage(error)}`,
				'CircuitBreaker',
			)
		}
	}

	/**
	 * Persist current state to storage
	 */
	private async persistCurrentState(): Promise<void> {
		if (!this.options.persistState) {
			return
		}

		try {
			await this.options.persistState({
				state: this.state,
				failureCount: this.failureCount,
				successCount: this.successCount,
				lastStateChange: this.lastStateChange,
				nextAttempt: this.nextAttempt,
			})
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(
				`Failed to persist circuit breaker state: ${errorMessage(error)}`,
				'CircuitBreaker',
			)
		}
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		if (this.persistenceTimer) {
			clearInterval(this.persistenceTimer)
			this.persistenceTimer = undefined
		}
	}

	/**
	 * Record a successful request
	 */
	recordSuccess(): void {
		this.successCount++
		this.totalRequests++
		this.requestWindow.push({ timestamp: Date.now(), success: true })
		this.pruneWindow()

		if (this.state === CircuitState.HALF_OPEN) {
			CorrelatedLogger.log('Circuit breaker reset (successful request in half-open state)', 'CircuitBreaker')
			this.reset()
		}
	}

	/**
	 * Record a failed request
	 */
	recordFailure(): void {
		this.failureCount++
		this.totalRequests++
		this.windowFailureCount++
		this.requestWindow.push({ timestamp: Date.now(), success: false })
		this.pruneWindow()

		if (this.state === CircuitState.HALF_OPEN) {
			CorrelatedLogger.warn('Circuit breaker reopened (failed request in half-open state)', 'CircuitBreaker')
			this.trip()
			return
		}

		const windowSize = this.requestWindow.length
		if (windowSize < this.options.minimumRequests) {
			return
		}

		const failurePercentage = this.calculateFailurePercentage()
		if (failurePercentage >= this.options.failureThreshold) {
			CorrelatedLogger.warn(
				`Circuit breaker tripped (failure rate: ${failurePercentage.toFixed(2)}%)`,
				'CircuitBreaker',
			)
			this.trip()
		}
	}

	/**
	 * Check if the circuit is open.
	 *
	 * Pure status read for reporting (health indicators, `/health/circuit-breaker`):
	 * besides the OPEN→HALF_OPEN time-based transition (an intentional,
	 * idempotent lazy-evaluation side effect — repeated calls are safe), this
	 * does NOT claim the HALF_OPEN canary slot. Callers that are about to
	 * make a real gated request must use allowRequest() instead, or a status
	 * poll (e.g. a liveness probe hitting the health indicator with no
	 * configured health-check URLs) would silently consume the one recovery
	 * trial and starve every real request behind it.
	 */
	isOpen(): boolean {
		if (this.state === CircuitState.OPEN) {
			const now = Date.now()
			if (now >= this.nextAttempt) {
				CorrelatedLogger.log('Circuit breaker entering half-open state', 'CircuitBreaker')
				this.state = CircuitState.HALF_OPEN
				this.lastStateChange = now
				return false
			}
			return true
		}
		return false
	}

	/**
	 * Decide whether a NEW request attempt may proceed right now — the method
	 * application code should call immediately before making the real gated
	 * call (HttpClientService.executeRequest).
	 *
	 * Unlike isOpen(), this claims a slot: in HALF_OPEN, exactly one caller is
	 * let through as the recovery canary and every other concurrent caller is
	 * rejected until that trial settles (releaseHalfOpenTrial(), or
	 * recordSuccess()/recordFailure() transitioning the breaker via
	 * reset()/trip()). This is the standard half-open behavior used by
	 * circuit breakers such as opossum/Polly/Hystrix — recovery is probed
	 * with a single trial request, not a burst of concurrent ones.
	 */
	allowRequest(): boolean {
		if (this.isOpen()) {
			return false
		}

		if (this.state === CircuitState.HALF_OPEN) {
			if (this.halfOpenTrialInFlight) {
				return false
			}
			this.halfOpenTrialInFlight = true
			return true
		}

		return true
	}

	/**
	 * Release the in-flight HALF_OPEN trial claim, if any, without affecting
	 * failure/success statistics.
	 *
	 * recordSuccess()/recordFailure() already release the claim as part of
	 * their own HALF_OPEN handling (reset()/trip()) — but only when they are
	 * actually called. Callers that filter which outcomes count toward the
	 * breaker (e.g. HttpClientService only counts 5xx/network errors as
	 * upstream failures, not a normal 404) must call this unconditionally
	 * once the gated attempt settles, or an outcome that isn't counted would
	 * leave the canary slot claimed forever and deadlock recovery.
	 */
	releaseHalfOpenTrial(): void {
		this.halfOpenTrialInFlight = false
	}

	/**
	 * Get the current state of the circuit breaker
	 */
	getState(): CircuitState {
		return this.state
	}

	/**
	 * Get circuit breaker statistics
	 */
	getStats(): {
		state: CircuitState
		failureCount: number
		successCount: number
		totalRequests: number
		failurePercentage: number
		lastStateChange: number
		nextAttempt: number
	} {
		return {
			state: this.state,
			failureCount: this.failureCount,
			successCount: this.successCount,
			totalRequests: this.totalRequests,
			failurePercentage: this.calculateFailurePercentage(),
			lastStateChange: this.lastStateChange,
			nextAttempt: this.nextAttempt,
		}
	}

	/**
	 * Reset the circuit breaker
	 */
	reset(): void {
		this.state = CircuitState.CLOSED
		this.failureCount = 0
		this.successCount = 0
		this.totalRequests = 0
		this.lastStateChange = Date.now()
		this.nextAttempt = 0
		this.requestWindow.length = 0
		this.windowFailureCount = 0
		this.halfOpenTrialInFlight = false
		CorrelatedLogger.log('Circuit breaker reset', 'CircuitBreaker')
	}

	/**
	 * Trip the circuit breaker
	 */
	private trip(): void {
		this.state = CircuitState.OPEN
		this.lastStateChange = Date.now()
		this.nextAttempt = Date.now() + this.options.resetTimeout
		this.halfOpenTrialInFlight = false
	}

	/**
	 * Calculate the failure percentage using incremental failure counter (O(1))
	 */
	private calculateFailurePercentage(): number {
		const windowSize = this.requestWindow.length
		if (windowSize === 0) {
			return 0
		}

		return (this.windowFailureCount / windowSize) * 100
	}

	/**
	 * Remove old entries from the request window, tracking removed failures
	 */
	private pruneWindow(): void {
		const now = Date.now()
		const cutoff = now - this.options.rollingWindow

		let i = 0
		while (i < this.requestWindow.length && this.requestWindow[i].timestamp < cutoff) {
			if (!this.requestWindow[i].success) {
				this.windowFailureCount--
			}
			i++
		}

		if (i > 0) {
			this.requestWindow.splice(0, i)
		}
	}
}
