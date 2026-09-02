export interface HttpClientStats {
	totalRequests: number
	successfulRequests: number
	failedRequests: number
	retriedRequests: number
	/** Exponential moving average, milliseconds. */
	averageResponseTime: number
	circuitBreakerState: 'closed' | 'open' | 'half-open'
	activeRequests: number
}
