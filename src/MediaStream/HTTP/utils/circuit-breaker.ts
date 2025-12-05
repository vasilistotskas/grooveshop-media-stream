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
	name?: string
	persistState?: (state: CircuitBreakerPersistedState) => Promise<void>
	loadState?: () => Promise<CircuitBreakerPersistedState | null>
}

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
	private persistenceTimer?: NodeJS.Timeout

	constructor(options: CircuitBreakerOptions) {
		this.options = {
			failureThreshold: options.failureThreshold || 50,
			resetTimeout: options.resetTimeout || 30000,
			rollingWindow: options.rollingWindow || 60000,
			minimumRequests: options.minimumRequests || 5,
			name: options.name || 'default',
			persistState: options.persistState,
			loadState: options.loadState,
		}

		// Load persisted state on initialization
		this.loadPersistedState()

		// Setup periodic state persistence
		if (this.options.persistState) {
			this.persistenceTimer = setInterval(() => this.persistCurrentState(), 10000)
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
				`Failed to load circuit breaker state: ${(error as Error).message}`,
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
				`Failed to persist circuit breaker state: ${(error as Error).message}`,
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
	 * Execute a function with circuit breaker protection
	 */
	async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
		if (this.isOpen()) {
			if (fallback) {
				CorrelatedLogger.warn('Circuit is open, using fallback', 'CircuitBreaker')
				return fallback()
			}
			throw new Error('Circuit breaker is open')
		}

		try {
			const result = await fn()
			this.recordSuccess()
			return result
		}
		catch (error: unknown) {
			this.recordFailure()
			if (fallback) {
				CorrelatedLogger.warn(`Request failed, using fallback: ${(error as Error).message}`, 'CircuitBreaker')
				return fallback()
			}
			throw error
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
	 * Check if the circuit is open
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
		CorrelatedLogger.log('Circuit breaker reset', 'CircuitBreaker')
	}

	/**
	 * Trip the circuit breaker
	 */
	private trip(): void {
		this.state = CircuitState.OPEN
		this.lastStateChange = Date.now()
		this.nextAttempt = Date.now() + this.options.resetTimeout
	}

	/**
	 * Calculate the failure percentage
	 */
	private calculateFailurePercentage(): number {
		this.pruneWindow()
		const windowSize = this.requestWindow.length
		if (windowSize === 0) {
			return 0
		}

		const failures = this.requestWindow.filter(r => !r.success).length
		return (failures / windowSize) * 100
	}

	/**
	 * Remove old entries from the request window
	 */
	private pruneWindow(): void {
		const now = Date.now()
		const cutoff = now - this.options.rollingWindow

		let i = 0
		while (i < this.requestWindow.length && this.requestWindow[i].timestamp < cutoff) {
			i++
		}

		if (i > 0) {
			this.requestWindow.splice(0, i)
		}
	}
}
