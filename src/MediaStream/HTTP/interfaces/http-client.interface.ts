import type { AxiosRequestConfig, AxiosResponse } from 'axios'

export interface HttpClientOptions {
	/**
	 * Base URL for all requests
	 */
	baseURL?: string

	/**
	 * Default timeout in milliseconds
	 */
	timeout?: number

	/**
	 * Maximum number of retries
	 */
	maxRetries?: number

	/**
	 * Retry delay in milliseconds (for exponential backoff, this is the base delay)
	 */
	retryDelay?: number

	/**
	 * Maximum retry delay in milliseconds
	 */
	maxRetryDelay?: number

	/**
	 * HTTP status codes that should trigger a retry
	 */
	retryStatusCodes?: number[]

	/**
	 * Maximum number of concurrent requests
	 */
	maxConcurrent?: number

	/**
	 * Keep-alive timeout in milliseconds
	 */
	keepAliveTimeout?: number

	/**
	 * Maximum sockets per host
	 */
	maxSockets?: number

	/**
	 * Circuit breaker options
	 */
	circuitBreaker?: CircuitBreakerOptions

	/**
	 * Headers to include in every request
	 */
	headers?: Record<string, string>

	/**
	 * Whether to follow redirects
	 */
	followRedirects?: boolean

	/**
	 * Maximum redirects to follow
	 */
	maxRedirects?: number
}

export interface CircuitBreakerOptions {
	/**
	 * Failure threshold percentage (0-100)
	 */
	failureThreshold: number

	/**
	 * Reset timeout in milliseconds
	 */
	resetTimeout: number

	/**
	 * Rolling window in milliseconds
	 */
	rollingWindow: number

	/**
	 * Minimum number of requests before tripping
	 */
	minimumRequests: number
}

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
	 * Reset client statistics
	 */
	resetStats: () => void

	/**
	 * Check if the circuit breaker is open
	 */
	isCircuitOpen: () => boolean

	/**
	 * Reset the circuit breaker
	 */
	resetCircuitBreaker: () => void
}
