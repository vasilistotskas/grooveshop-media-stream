import type { AxiosResponse } from 'axios'
import { HttpService, HttpModule as NestHttpModule } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import { AxiosError } from 'axios'
import { Observable, of, throwError } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { CircuitBreakerOpenError } from '#microservice/common/errors/media-stream.errors'
import { ConfigService } from '#microservice/Config/config.service'
import { HttpClientService } from '#microservice/HTTP/services/http-client.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

describe('httpClientService', () => {
	let service: HttpClientService
	let httpService: HttpService

	let mockConfigService: ConfigService

	const mockRedisCacheService = {
		set: vi.fn(),
		get: vi.fn(),
	}

	beforeEach(async () => {
		vi.clearAllMocks()
		mockConfigService = createConfigServiceMock()

		const module: TestingModule = await Test.createTestingModule({
			imports: [NestHttpModule],
			providers: [
				HttpClientService,
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
				{
					provide: RedisCacheService,
					useValue: mockRedisCacheService,
				},
			],
		}).compile()

		service = module.get<HttpClientService>(HttpClientService)
		httpService = module.get<HttpService>(HttpService)
	})

	describe('initialization', () => {
		it('should be defined', () => {
			expect(service).toBeDefined()
		})

		it('should load the http configuration group once', () => {
			expect(mockConfigService.get).toHaveBeenCalledWith('http')
		})
	})

	describe('hTTP Methods', () => {
		it('should execute GET requests', async () => {
			const mockResponse: AxiosResponse = {
				data: { test: 'data' },
				status: 200,
				statusText: 'OK',
				headers: {},
				config: { url: 'https://example.com', method: 'get' } as any,
			}

			vi.spyOn(httpService, 'get').mockReturnValueOnce(of(mockResponse))

			const result = await service.get('https://example.com')
			expect(result).toEqual(mockResponse)
			expect(httpService.get).toHaveBeenCalledWith(expect.stringContaining('example.com'), expect.any(Object))
		})
	})

	describe('error Handling', () => {
		beforeEach(() => {
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		it('should handle network errors', async () => {
			const mockError = new Error('Network Error') as AxiosError
			mockError.code = 'ECONNRESET'
			mockError.message = 'Connection reset'

			vi.spyOn(httpService, 'get').mockReturnValueOnce(throwError(() => mockError))

			const promise = service.get('https://example.com')

			vi.runAllTimers()

			await expect(promise).rejects.toThrow()
		})

		it('should handle HTTP errors', async () => {
			const mockError = new Error('HTTP Error') as AxiosError
			mockError.response = { status: 500, data: 'Server Error' } as any

			vi.spyOn(httpService, 'get').mockReturnValueOnce(throwError(() => mockError))

			const promise = service.get('https://example.com')

			vi.runAllTimers()

			await expect(promise).rejects.toThrow()
		})
	})

	describe('circuit Breaker', () => {
		it('should track successful requests', async () => {
			const mockResponse: AxiosResponse = {
				data: { test: 'data' },
				status: 200,
				statusText: 'OK',
				headers: {},
				config: { url: 'https://example.com', method: 'get' } as any,
			}

			vi.spyOn(httpService, 'get').mockReturnValue(of(mockResponse))

			// Execute several successful requests
			await service.get('https://example.com')
			await service.get('https://example.com')
			await service.get('https://example.com')

			const stats = service.getStats()
			expect(stats.successfulRequests).toBe(3)
			expect(stats.failedRequests).toBe(0)
			expect(stats.circuitBreakerState).toBe('closed')
		})

		it('should track failed requests', async () => {
			const mockError = new Error('HTTP Error') as AxiosError
			mockError.response = { status: 500, data: 'Server Error' } as any

			vi.spyOn(httpService, 'get').mockReturnValue(throwError(() => mockError))

			// Execute several failed requests
			try {
				await service.get('https://example.com')
			}
			catch {

			}
			try {
				await service.get('https://example.com')
			}
			catch {

			}

			const stats = service.getStats()
			expect(stats.successfulRequests).toBe(0)
			expect(stats.failedRequests).toBe(2)
		}, 15000)

		it('rejects with CircuitBreakerOpenError, without a request, once the breaker is open', async () => {
			const module: TestingModule = await Test.createTestingModule({
				imports: [NestHttpModule],
				providers: [
					HttpClientService,
					{
						provide: ConfigService,
						useValue: createConfigServiceMock({
							'http.maxRetries': 0,
							'http.circuitBreaker.minimumRequests': 1,
							'http.circuitBreaker.failureThreshold': 50,
						}),
					},
					{ provide: RedisCacheService, useValue: mockRedisCacheService },
				],
			}).compile()
			const trippable = module.get<HttpClientService>(HttpClientService)
			const trippableHttp = module.get<HttpService>(HttpService)

			const upstreamError = new Error('HTTP Error') as AxiosError
			upstreamError.response = { status: 503, data: 'Unavailable' } as any
			const getSpy = vi.spyOn(trippableHttp, 'get').mockReturnValue(throwError(() => upstreamError))

			await expect(trippable.get('https://example.com')).rejects.toBe(upstreamError)
			expect(trippable.isCircuitOpen()).toBe(true)

			getSpy.mockClear()
			await expect(trippable.get('https://example.com')).rejects.toBeInstanceOf(CircuitBreakerOpenError)
			expect(getSpy).not.toHaveBeenCalled()
		})
	})

	describe('concurrency Control', () => {
		it('should track active requests', async () => {
			const mockResponse: AxiosResponse = {
				data: { test: 'data' },
				status: 200,
				statusText: 'OK',
				headers: {},
				config: { url: 'https://example.com', method: 'get' } as any,
			}

			// Create a delayed response
			vi.spyOn(httpService, 'get').mockImplementation(() => {
				return new Observable((subscriber) => {
					setTimeout(() => {
						subscriber.next(mockResponse)
						subscriber.complete()
					}, 100)
				})
			})

			// Start a request but don't await it
			const promise = service.get('https://example.com')

			// Check active requests
			const stats = service.getStats()
			expect(stats.activeRequests).toBeGreaterThan(0)

			// Wait for request to complete
			await promise
		})
	})
})
