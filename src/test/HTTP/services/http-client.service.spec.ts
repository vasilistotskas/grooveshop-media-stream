import { ConfigService } from '@microservice/Config/config.service'
import { HttpClientService } from '@microservice/HTTP/services/http-client.service'
import { HttpService, HttpModule as NestHttpModule } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import { AxiosError, AxiosResponse } from 'axios'
import { Observable, of, throwError } from 'rxjs'

describe('httpClientService', () => {
	let service: HttpClientService
	let httpService: HttpService

	const mockConfigService = {
		getOptional: jest.fn(),
	}

	beforeEach(async () => {
		jest.clearAllMocks()

		// Setup default config values
		mockConfigService.getOptional.mockImplementation((_key: string, defaultValue: any) => {
			return defaultValue
		})

		const module: TestingModule = await Test.createTestingModule({
			imports: [NestHttpModule],
			providers: [
				HttpClientService,
				{
					provide: ConfigService,
					useValue: mockConfigService,
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

		it('should load configuration from ConfigService', () => {
			expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.retry.retries', 3)
			expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.retry.retryDelay', 1000)
			expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.retry.maxRetryDelay', 10000)
			expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.connectionPool.timeout', 30000)
			expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.circuitBreaker.failureThreshold', 5)
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

			jest.spyOn(httpService, 'get').mockReturnValueOnce(of(mockResponse))

			const result = await service.get('https://example.com')
			expect(result).toEqual(mockResponse)
			expect(httpService.get).toHaveBeenCalledWith('https://example.com', expect.any(Object))
		})

		it('should execute POST requests', async () => {
			const mockResponse: AxiosResponse = {
				data: { test: 'data' },
				status: 200,
				statusText: 'OK',
				headers: {},
				config: { url: 'https://example.com', method: 'post' } as any,
			}

			const postData = { foo: 'bar' }
			jest.spyOn(httpService, 'post').mockReturnValueOnce(of(mockResponse))

			const result = await service.post('https://example.com', postData)
			expect(result).toEqual(mockResponse)
			expect(httpService.post).toHaveBeenCalledWith('https://example.com', postData, expect.any(Object))
		})
	})

	describe('error Handling', () => {
		beforeEach(() => {
			jest.useFakeTimers()
		})

		afterEach(() => {
			jest.useRealTimers()
		})

		it('should handle network errors', async () => {
			const mockError = new Error('Network Error') as AxiosError
			mockError.code = 'ECONNRESET'
			mockError.message = 'Connection reset'

			jest.spyOn(httpService, 'get').mockReturnValueOnce(throwError(() => mockError))

			const promise = service.get('https://example.com')

			jest.runAllTimers()

			await expect(promise).rejects.toThrow()
		})

		it('should handle HTTP errors', async () => {
			const mockError = new Error('HTTP Error') as AxiosError
			mockError.response = { status: 500, data: 'Server Error' } as any

			jest.spyOn(httpService, 'get').mockReturnValueOnce(throwError(() => mockError))

			const promise = service.get('https://example.com')

			jest.runAllTimers()

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

			jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse))

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

			jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => mockError))

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

		it('should reset statistics', async () => {
			const mockResponse: AxiosResponse = {
				data: { test: 'data' },
				status: 200,
				statusText: 'OK',
				headers: {},
				config: { url: 'https://example.com', method: 'get' } as any,
			}

			jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse))

			// Execute a successful request
			await service.get('https://example.com')

			// Reset stats
			service.resetStats()

			const stats = service.getStats()
			expect(stats.totalRequests).toBe(0)
			expect(stats.successfulRequests).toBe(0)
			expect(stats.failedRequests).toBe(0)
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
			jest.spyOn(httpService, 'get').mockImplementation(() => {
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
