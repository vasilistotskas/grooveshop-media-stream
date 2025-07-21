import * as http from 'node:http'
import { Agent as HttpAgent } from 'node:http'
import * as https from 'node:https'
import { Agent as HttpsAgent } from 'node:https'
import { performance } from 'node:perf_hooks'
import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { HttpService } from '@nestjs/axios'
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { AxiosRequestConfig, AxiosResponse } from 'axios'
import { lastValueFrom, throwError, timer } from 'rxjs'
import { mergeMap, retryWhen, tap } from 'rxjs/operators'
import { HttpClientStats, IHttpClient } from '../interfaces/http-client.interface'
import { CircuitBreaker } from '../utils/circuit-breaker'

@Injectable()
export class HttpClientService implements IHttpClient, OnModuleInit, OnModuleDestroy {
	private readonly circuitBreaker: CircuitBreaker
	private readonly httpAgent: HttpAgent
	private readonly httpsAgent: HttpsAgent
	private readonly stats: HttpClientStats = {
		totalRequests: 0,
		successfulRequests: 0,
		failedRequests: 0,
		retriedRequests: 0,
		averageResponseTime: 0,
		circuitBreakerState: 'closed',
		activeRequests: 0,
		queueSize: 0,
	}

	private totalResponseTime = 0
	private readonly maxRetries: number
	private readonly retryDelay: number
	private readonly maxRetryDelay: number
	private readonly timeout: number

	constructor(
		private readonly httpService: HttpService,
		private readonly configService: ConfigService,
	) {
		// Load configuration with fallbacks
		this.maxRetries = this.configService.getOptional('http.retry.retries', 3)
		this.retryDelay = this.configService.getOptional('http.retry.retryDelay', 1000)
		this.maxRetryDelay = this.configService.getOptional('http.retry.maxRetryDelay', 10000)
		this.timeout = this.configService.getOptional('http.connectionPool.timeout', 30000)

		// Create circuit breaker
		this.circuitBreaker = new CircuitBreaker({
			failureThreshold: this.configService.getOptional('http.circuitBreaker.failureThreshold', 5),
			resetTimeout: this.configService.getOptional('http.circuitBreaker.resetTimeout', 60000),
			rollingWindow: this.configService.getOptional('http.circuitBreaker.monitoringPeriod', 30000),
			minimumRequests: 5,
		})

		// Create HTTP agents with keep-alive
		const maxSockets = this.configService.getOptional('http.connectionPool.maxSockets', 50)
		const keepAliveMsecs = this.configService.getOptional('http.connectionPool.keepAliveMsecs', 1000)

		this.httpAgent = new http.Agent({
			keepAlive: true,
			keepAliveMsecs,
			maxSockets,
		})

		this.httpsAgent = new https.Agent({
			keepAlive: true,
			keepAliveMsecs,
			maxSockets,
		})

		// Configure axios
		this.configureAxios()
	}

	async onModuleInit() {
		CorrelatedLogger.log('HTTP client service initialized', HttpClientService.name)
	}

	async onModuleDestroy() {
		// Close agents
		this.httpAgent.destroy()
		this.httpsAgent.destroy()
		CorrelatedLogger.log('HTTP client service destroyed', HttpClientService.name)
	}

	/**
	 * Send a GET request
	 */
	async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this.httpService.get<T>(url, this.prepareConfig(config)))
	}

	/**
	 * Send a POST request
	 */
	async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this.httpService.post<T>(url, data, this.prepareConfig(config)))
	}

	/**
	 * Send a PUT request
	 */
	async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this.httpService.put<T>(url, data, this.prepareConfig(config)))
	}

	/**
	 * Send a DELETE request
	 */
	async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this.httpService.delete<T>(url, this.prepareConfig(config)))
	}

	/**
	 * Send a HEAD request
	 */
	async head<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this.httpService.head<T>(url, this.prepareConfig(config)))
	}

	/**
	 * Send a PATCH request
	 */
	async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this.httpService.patch<T>(url, data, this.prepareConfig(config)))
	}

	/**
	 * Send a request with custom config
	 */
	async request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this.httpService.request<T>(this.prepareConfig(config)))
	}

	/**
	 * Get client statistics
	 */
	getStats(): HttpClientStats {
		return {
			...this.stats,
			circuitBreakerState: this.circuitBreaker.getState(),
		}
	}

	/**
	 * Reset client statistics
	 */
	resetStats(): void {
		this.stats.totalRequests = 0
		this.stats.successfulRequests = 0
		this.stats.failedRequests = 0
		this.stats.retriedRequests = 0
		this.stats.averageResponseTime = 0
		this.totalResponseTime = 0
		CorrelatedLogger.debug('HTTP client statistics reset', HttpClientService.name)
	}

	/**
	 * Check if the circuit breaker is open
	 */
	isCircuitOpen(): boolean {
		return this.circuitBreaker.isOpen()
	}

	/**
	 * Reset the circuit breaker
	 */
	resetCircuitBreaker(): void {
		this.circuitBreaker.reset()
	}

	/**
	 * Execute a request with circuit breaker and retry logic
	 */
	private async executeRequest<T>(requestFn: () => any): Promise<AxiosResponse<T>> {
		// Check if circuit breaker is open
		if (this.circuitBreaker.isOpen()) {
			throw new Error('Circuit breaker is open')
		}

		const startTime = performance.now()
		this.stats.activeRequests++
		this.stats.totalRequests++

		try {
			// Execute request with retry logic
			const response: AxiosResponse<T> = await lastValueFrom(
				requestFn().pipe(
					retryWhen(errors =>
						errors.pipe(
							mergeMap((error, attempt) => {
								// Don't retry if not a retryable error
								if (!this.isRetryableError(error)) {
									return throwError(() => error)
								}

								// Don't retry if max retries reached
								if (attempt >= this.maxRetries) {
									return throwError(() => error)
								}

								// Increment retry counter
								this.stats.retriedRequests++

								// Calculate exponential backoff delay
								const delay = Math.min(
									this.retryDelay * 2 ** attempt,
									this.maxRetryDelay,
								)

								CorrelatedLogger.warn(
									`Retrying request (attempt ${attempt + 1}/${this.maxRetries}) after ${delay}ms: ${error.message}`,
									HttpClientService.name,
								)

								// Retry after delay
								return timer(delay)
							}),
						),
					),
					tap({
						error: (error) => {
							this.stats.failedRequests++
							this.circuitBreaker.recordFailure()
							CorrelatedLogger.error(
								`HTTP request failed: ${error.message}`,
								error.stack,
								HttpClientService.name,
							)
						},
						next: (response: AxiosResponse<T>) => {
							this.stats.successfulRequests++
							this.circuitBreaker.recordSuccess()
							CorrelatedLogger.debug(
								`HTTP request succeeded: ${response.config?.method?.toUpperCase()} ${response.config?.url} ${response.status}`,
								HttpClientService.name,
							)
						},
					}),
				),
			)

			// Update response time statistics
			const responseTime = performance.now() - startTime
			this.totalResponseTime += responseTime
			this.stats.averageResponseTime = this.totalResponseTime / this.stats.successfulRequests

			return response
		}
		catch (error) {
			// Update response time for failed requests too
			const responseTime = performance.now() - startTime
			this.totalResponseTime += responseTime

			throw error
		}
		finally {
			this.stats.activeRequests--
		}
	}

	/**
	 * Check if an error is retryable
	 */
	private isRetryableError(error: any): boolean {
		// Network errors are always retryable
		if (error.code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(error.code)) {
			return true
		}

		// Check if status code is in the retry list
		if (error.response && [408, 429, 500, 502, 503, 504].includes(error.response.status)) {
			return true
		}

		return false
	}

	/**
	 * Prepare request configuration
	 */
	private prepareConfig(config: AxiosRequestConfig = {}): AxiosRequestConfig {
		return {
			...config,
			timeout: config.timeout || this.timeout,
			httpAgent: this.httpAgent,
			httpsAgent: this.httpsAgent,
		}
	}

	/**
	 * Configure axios defaults
	 */
	private configureAxios(): void {
		// Set default timeout
		this.httpService.axiosRef.defaults.timeout = this.timeout
	}
}
