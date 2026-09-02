import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import type { Observable } from 'rxjs'
import type { HttpConfig } from '#microservice/Config/interfaces/app-config.interface'
import type { HttpClientStats } from '../interfaces/http-client.interface.js'
import type { CircuitBreakerPersistedState } from '../utils/circuit-breaker.js'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import { performance } from 'node:perf_hooks'
import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { lastValueFrom, retry, tap, throwError, timer } from 'rxjs'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { CircuitBreakerOpenError } from '#microservice/common/errors/media-stream.errors'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { CircuitBreaker, CircuitState } from '../utils/circuit-breaker.js'

const CIRCUIT_BREAKER_KEY = 'circuit_breaker:http_client'
const CIRCUIT_BREAKER_STATE_TTL_SECONDS = 300
/** Exponential moving average smoothing factor for the response-time stat. */
const EMA_ALPHA = 0.1
const RETRYABLE_ERRNO_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'])
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])

interface HttpErrorLike {
	code?: string
	response?: { status?: number }
}

/**
 * Upstream HTTP client: keep-alive agents, exponential-backoff retry and a
 * Redis-persisted circuit breaker in front of `@nestjs/axios`.
 */
@Injectable()
export class HttpClientService implements OnModuleInit, OnModuleDestroy {
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
	}

	private readonly maxRetries: number
	private readonly retryDelay: number
	private readonly maxRetryDelay: number
	private readonly timeout: number
	private readonly circuitBreakerEnabled: boolean

	constructor(
		private readonly httpService: HttpService,
		configService: ConfigService,
		private readonly redisCacheService: RedisCacheService,
	) {
		const http = configService.get<HttpConfig>('http')
		this.maxRetries = http.maxRetries
		this.retryDelay = http.retryDelay
		this.maxRetryDelay = http.maxRetryDelay
		this.timeout = http.timeout
		this.circuitBreakerEnabled = http.circuitBreaker.enabled

		this.circuitBreaker = new CircuitBreaker({
			failureThreshold: http.circuitBreaker.failureThreshold,
			resetTimeout: http.circuitBreaker.resetTimeout,
			rollingWindow: http.circuitBreaker.monitoringPeriod,
			minimumRequests: http.circuitBreaker.minimumRequests,
			persistState: state => this.persistCircuitBreakerState(state),
			loadState: () => this.loadCircuitBreakerState(),
		})

		const { maxSockets, keepAliveMsecs } = http.connectionPool
		this.httpAgent = new HttpAgent({ keepAlive: true, keepAliveMsecs, maxSockets })
		this.httpsAgent = new HttpsAgent({ keepAlive: true, keepAliveMsecs, maxSockets })

		// Redirects are disabled globally as well as per request (prepareConfig):
		// an upstream redirect could pivot to a host outside the domain allowlist.
		this.httpService.axiosRef.defaults.timeout = this.timeout
		this.httpService.axiosRef.defaults.maxRedirects = 0
	}

	async onModuleInit(): Promise<void> {
		// Restore circuit-breaker state from Redis before serving traffic and
		// start its periodic persistence timer.
		await this.circuitBreaker.init()
		CorrelatedLogger.log(`HTTP client service initialized (circuit breaker ${this.circuitBreakerEnabled ? 'enabled' : 'disabled'})`, HttpClientService.name)
	}

	onModuleDestroy(): void {
		this.httpAgent.destroy()
		this.httpsAgent.destroy()
		this.circuitBreaker.destroy()
		CorrelatedLogger.log('HTTP client service destroyed', HttpClientService.name)
	}

	async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this.httpService.get<T>(url, this.prepareConfig(config)))
	}

	async request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.executeRequest(() => this.httpService.request<T>(this.prepareConfig(config)))
	}

	getStats(): HttpClientStats {
		return {
			...this.stats,
			circuitBreakerState: this.circuitBreaker.getState(),
		}
	}

	isCircuitOpen(): boolean {
		return this.circuitBreaker.isOpen()
	}

	resetCircuitBreaker(): void {
		this.circuitBreaker.reset()
	}

	private async persistCircuitBreakerState(state: CircuitBreakerPersistedState): Promise<void> {
		try {
			await this.redisCacheService.set(CIRCUIT_BREAKER_KEY, state, CIRCUIT_BREAKER_STATE_TTL_SECONDS)
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Failed to persist circuit breaker state: ${errorMessage(error)}`, HttpClientService.name)
		}
	}

	private async loadCircuitBreakerState(): Promise<CircuitBreakerPersistedState | null> {
		try {
			return await this.redisCacheService.get<CircuitBreakerPersistedState>(CIRCUIT_BREAKER_KEY)
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Failed to load circuit breaker state: ${errorMessage(error)}`, HttpClientService.name)
			return null
		}
	}

	/**
	 * Run one request through the circuit breaker and the retry policy.
	 * @throws CircuitBreakerOpenError when the breaker rejects the attempt (no request is made).
	 */
	private async executeRequest<T>(requestFn: () => Observable<AxiosResponse<T>>): Promise<AxiosResponse<T>> {
		// Tracks whether THIS call claimed the HALF_OPEN canary slot (i.e. it
		// is the one recovery trial), so the finally block below only ever
		// releases a claim it actually owns — never a different concurrent
		// request's in-flight trial.
		let isHalfOpenTrial = false
		if (this.circuitBreakerEnabled) {
			if (!this.circuitBreaker.allowRequest()) {
				CorrelatedLogger.warn('Circuit breaker is open, rejecting request', HttpClientService.name)
				throw new CircuitBreakerOpenError()
			}
			isHalfOpenTrial = this.circuitBreaker.getState() === CircuitState.HALF_OPEN
		}

		const startTime = performance.now()
		this.stats.activeRequests++
		this.stats.totalRequests++

		try {
			const response = await lastValueFrom(
				requestFn().pipe(
					retry({
						count: this.maxRetries,
						delay: (error: unknown, retryCount: number) => {
							if (!this.isRetryableError(error)) {
								return throwError(() => error)
							}

							this.stats.retriedRequests++
							const delayMs = Math.min(this.retryDelay * 2 ** (retryCount - 1), this.maxRetryDelay)
							CorrelatedLogger.warn(`Retrying request (attempt ${retryCount}/${this.maxRetries}) after ${delayMs}ms: ${errorMessage(error)}`, HttpClientService.name)
							return timer(delayMs)
						},
					}),
					tap({
						error: (error: unknown) => {
							this.stats.failedRequests++
							// Only UPSTREAM HEALTH counts toward the breaker.
							// axios rejects on every 4xx, so a tenant with a few
							// hundred broken media references booked one failure
							// per cache miss; the rate crossed the 50% threshold
							// and the breaker opened for EVERY tenant, serving
							// default.png platform-wide. The open state is
							// persisted to one global Redis key, so a freshly
							// rolled pod restored it. A 404 is a normal negative
							// result with its own 5-minute negative cache, not a
							// sign the upstream is unwell.
							if (this.circuitBreakerEnabled && this.isUpstreamFailure(error)) {
								this.circuitBreaker.recordFailure()
							}
							CorrelatedLogger.error(`HTTP request failed: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, HttpClientService.name)
						},
						next: (response: AxiosResponse<T>) => {
							this.stats.successfulRequests++
							if (this.circuitBreakerEnabled) {
								this.circuitBreaker.recordSuccess()
							}
							CorrelatedLogger.debug(`HTTP request succeeded: ${response.config?.method?.toUpperCase()} ${response.config?.url} ${response.status}`, HttpClientService.name)
						},
					}),
				),
			)

			const responseTime = performance.now() - startTime
			this.stats.averageResponseTime = this.stats.averageResponseTime === 0
				? responseTime
				: this.stats.averageResponseTime * (1 - EMA_ALPHA) + responseTime * EMA_ALPHA

			return response
		}
		finally {
			this.stats.activeRequests--
			// Safety net: recordSuccess()/recordFailure() above already release
			// the HALF_OPEN claim as part of reset()/trip(), but only when they
			// are actually invoked — the tap(error) handler skips recordFailure()
			// for outcomes isUpstreamFailure() doesn't count (e.g. a normal
			// 404). Without this, that outcome would leave the canary slot
			// claimed forever and deadlock recovery.
			if (isHalfOpenTrial) {
				this.circuitBreaker.releaseHalfOpenTrial()
			}
		}
	}

	/**
	 * Does this error indicate the UPSTREAM is unhealthy?
	 *
	 * Network faults and 5xx do. Client errors (404 for a missing
	 * image, 400 for a malformed request) do not — they are answers,
	 * not outages, and counting them let one tenant's broken references
	 * trip a breaker that is global across tenants and pods.
	 */
	private isUpstreamFailure(error: unknown): boolean {
		const status = (error as HttpErrorLike | null)?.response?.status
		if (typeof status === 'number') {
			return status >= 500
		}
		// No response at all: connection refused, DNS failure, timeout.
		return true
	}

	private isRetryableError(error: unknown): boolean {
		const { code, response } = (error as HttpErrorLike | null) ?? {}
		if (code && RETRYABLE_ERRNO_CODES.has(code)) {
			return true
		}
		return typeof response?.status === 'number' && RETRYABLE_STATUSES.has(response.status)
	}

	/**
	 * `maxRedirects: 0` — image URLs fetched from the upstream media storage
	 * never redirect, and following one could pivot to an internal host that
	 * is not on the domain allowlist (SSRF).
	 */
	private prepareConfig(config: AxiosRequestConfig = {}): AxiosRequestConfig {
		return {
			maxRedirects: 0,
			...config,
			timeout: config.timeout || this.timeout,
			httpAgent: this.httpAgent,
			httpsAgent: this.httpsAgent,
		}
	}
}
