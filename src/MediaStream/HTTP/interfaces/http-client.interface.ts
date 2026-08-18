import type { AxiosRequestConfig, AxiosResponse } from 'axios'

export interface HttpClientStats {
	/**
	 * Total number of requests
	 */
	totalRequests: number

	/**
	 * Number of successful requests
	 */
	successfulRequests: number

	/**
	 * Number of failed requests
	 */
	failedRequests: number

	/**
	 * Number of retried requests
	 */
	retriedRequests: number

	/**
	 * Average response time in milliseconds
	 */
	averageResponseTime: number

	/**
	 * Circuit breaker state
	 */
	circuitBreakerState: 'closed' | 'open' | 'half-open'

	/**
	 * Current active requests
	 */
	activeRequests: number

	/**
	 * Request queue size
	 */
	queueSize: number
}

export interface IHttpClient {
	/**
	 * Send a GET request
	 */
	get: <T = any>(url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>

	/**
	 * Send a POST request
	 */
	post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>

	/**
	 * Send a PUT request
	 */
	put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>

	/**
	 * Send a DELETE request
	 */
	delete: <T = any>(url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>

	/**
	 * Send a HEAD request
	 */
	head: <T = any>(url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>

	/**
	 * Send a PATCH request
	 */
	patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>

	/**
	 * Send a request with custom config
	 */
	request: <T = any>(config: AxiosRequestConfig) => Promise<AxiosResponse<T>>

	/**
	 * Get client statistics
	 */
	getStats: () => HttpClientStats

	/**
	 * Check if the circuit breaker is open
	 */
	isCircuitOpen: () => boolean

	/**
	 * Reset the circuit breaker
	 */
	resetCircuitBreaker: () => void
}
