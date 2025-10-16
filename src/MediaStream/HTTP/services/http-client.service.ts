import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import type { HttpClientStats, IHttpClient } from '../interfaces/http-client.interface'
import * as http from 'node:http'
import { Agent as HttpAgent } from 'node:http'
import * as https from 'node:https'
import { Agent as HttpsAgent } from 'node:https'
import { performance } from 'node:perf_hooks'
import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { lastValueFrom, throwError, timer } from 'rxjs'
import { retry, tap } from 'rxjs/operators'
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
		private readonly _httpService: HttpService,
		private readonly _configService: ConfigService,
	) {
		this.maxRetries = this._configService.getOptional('http.retry.retries', 3)
		this.retryDelay = this._configService.getOptional('http.retry.retryDelay', 1000)
		this.maxRetryDelay = this._configService.getOptional('http.retry.maxRetryDelay', 10000)
		this.timeout = this._configService.getOptional('http.connectionPool.timeout', 30000)

		this.circuitBreaker = new CircuitBreaker({
			failureThreshold: this._configService.getOptional('http.circuitBreaker.failureThreshold', 50),
			resetTimeout: this._configService.getOptional('http.circuitBreaker.resetTimeout', 30000),
			rollingWindow: this._configService.getOptional('http.circuitBreaker.monitoringPeriod', 60000),
			minimumRequests: this._configService.getOptional('http.circuitBreaker.minimumRequests', 10),
		})

		const maxSockets = this._configService.getOptional('http.connectionPool.maxSockets', 50)
		const keepAliveMsecs = this._configService.getOptional('http.connectionPool.keepAliveMsecs', 1000)

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

		this.configureAxios()
	}

	async onModuleInit(): Promise<void> {
		CorrelatedLogger.log('HTTP client service initialized', HttpClientService.name)
	}

	async onModuleDestroy(): Promise<void> {
		this.httpAgent.destroy()
		this.httpsAgent.destroy()
		CorrelatedLogger.log('HTTP client service destroyed', HttpClientService.name)
	}

	/**
	 * Send a GET request
	 */
	async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		const encodedUrl = this.encodeUrl(url)
		return this.executeRequest(() => this._httpService.get<T>(encodedUrl, this.prepareConfig(config)))
	}

	/**
	 * Send a POST request
	 */
	async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this._httpService.post<T>(url, data, this.prepareConfig(config)))
	}

	/**
	 * Send a PUT request
	 */
	async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this._httpService.put<T>(url, data, this.prepareConfig(config)))
	}

	/**
	 * Send a DELETE request
	 */
	async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this._httpService.delete<T>(url, this.prepareConfig(config)))
	}

	/**
	 * Send a HEAD request
	 */
	async head<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this._httpService.head<T>(url, this.prepareConfig(config)))
	}

	/**
	 * Send a PATCH request
	 */
	async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this._httpService.patch<T>(url, data, this.prepareConfig(config)))
	}

	/**
	 * Send a request with custom config
	 */
	async request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this._httpService.request<T>(this.prepareConfig(config)))
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
		if (this.circuitBreaker.isOpen()) {
			throw new Error('Circuit breaker is open')
		}

		const startTime = performance.now()
		this.stats.activeRequests++
		this.stats.totalRequests++

		try {
			const response: AxiosResponse<T> = await lastValueFrom(
				requestFn().pipe(
					retry({
						count: this.maxRetries,
						delay: (error, retryCount) => {
							if (!this.isRetryableError(error)) {
								return throwError(() => error)
							}

							this.stats.retriedRequests++

							const delayMs = Math.min(
								this.retryDelay * 2 ** (retryCount - 1),
								this.maxRetryDelay,
							)

							CorrelatedLogger.warn(
								`Retrying request (attempt ${retryCount}/${this.maxRetries}) after ${delayMs}ms: ${(error as Error).message}`,
								HttpClientService.name,
							)

							return timer(delayMs)
						},
					}),
					tap({
						error: (error: unknown) => {
							this.stats.failedRequests++
							this.circuitBreaker.recordFailure()
							CorrelatedLogger.error(
								`HTTP request failed: ${(error as Error).message}`,
								(error as Error).stack,
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

			const responseTime = performance.now() - startTime
			this.totalResponseTime += responseTime
			this.stats.averageResponseTime = this.totalResponseTime / this.stats.successfulRequests

			return response
		}
		catch (error: unknown) {
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
		if ((error as any).code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes((error as any).code)) {
			return true
		}

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
		this._httpService.axiosRef.defaults.timeout = this.timeout
	}

	/**
	 * Encode URL to handle non-ASCII characters properly
	 */
	private encodeUrl(url: string): string {
		try {
			const urlObj = new URL(url)

			const pathSegments = urlObj.pathname.split('/').map((segment) => {
			// eslint-disable-next-line no-control-regex
				if (/[^\u0000-\u007F]/.test(segment)) {
					return encodeURIComponent(segment)
				}
				return segment
			})

			urlObj.pathname = pathSegments.join('/')

			return urlObj.toString()
		}
		catch (error) {
			CorrelatedLogger.warn(`Failed to encode URL: ${url} - ${(error as Error).message}`, HttpClientService.name)
			return url
		}
	}
}
