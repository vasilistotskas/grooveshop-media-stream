import { ConfigService } from '@microservice/Config/config.service'
import { HttpHealthIndicator } from '@microservice/HTTP/indicators/http-health.indicator'
import { HttpClientService } from '@microservice/HTTP/services/http-client.service'
import { Test, TestingModule } from '@nestjs/testing'
import { AxiosResponse } from 'axios'

describe('httpHealthIndicator', () => {
	let indicator: HttpHealthIndicator
	let httpClientService: HttpClientService
	let configService: ConfigService

	const mockHttpClientService = {
		getStats: jest.fn(),
		isCircuitOpen: jest.fn(),
		get: jest.fn(),
	}

	const mockConfigService = {
		getOptional: jest.fn(),
	}

	beforeEach(async () => {
		jest.clearAllMocks()

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				HttpHealthIndicator,
				{
					provide: HttpClientService,
					useValue: mockHttpClientService,
				},
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
			],
		}).compile()

		indicator = module.get<HttpHealthIndicator>(HttpHealthIndicator)
		httpClientService = module.get<HttpClientService>(HttpClientService)
		configService = module.get<ConfigService>(ConfigService)
	})

	describe('initialization', () => {
		it('should be defined', () => {
			expect(indicator).toBeDefined()
		})

		it('should load configuration from ConfigService', () => {
			expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.healthCheck.urls', [])
			expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.healthCheck.timeout', 5000)
		})
	})

	describe('health Check - No URLs Configured', () => {
		beforeEach(() => {
			mockConfigService.getOptional.mockImplementation((key: string, defaultValue: any) => {
				if (key === 'http.healthCheck.urls')
					return []
				if (key === 'http.healthCheck.timeout')
					return 5000
				return defaultValue
			})
		})

		it('should return healthy when circuit breaker is closed', async () => {
			mockHttpClientService.isCircuitOpen.mockReturnValue(false)
			mockHttpClientService.getStats.mockReturnValue({
				totalRequests: 10,
				successfulRequests: 8,
				failedRequests: 2,
				circuitBreakerState: 'closed',
			})

			const result = await indicator.isHealthy('http')

			expect(result).toEqual({
				http: {
					status: 'up',
					circuitBreaker: 'closed',
					stats: {
						totalRequests: 10,
						successfulRequests: 8,
						failedRequests: 2,
						circuitBreakerState: 'closed',
					},
				},
			})
		})

		it('should return unhealthy when circuit breaker is open', async () => {
			mockHttpClientService.isCircuitOpen.mockReturnValue(true)
			mockHttpClientService.getStats.mockReturnValue({
				totalRequests: 10,
				successfulRequests: 3,
				failedRequests: 7,
				circuitBreakerState: 'open',
			})

			const result = await indicator.isHealthy('http')

			expect(result).toEqual({
				http: {
					status: 'down',
					circuitBreaker: 'open',
					stats: {
						totalRequests: 10,
						successfulRequests: 3,
						failedRequests: 7,
						circuitBreakerState: 'open',
					},
				},
			})
		})
	})

	describe('health Check - With URLs Configured', () => {
		beforeEach(() => {
			mockConfigService.getOptional.mockImplementation((key: string, defaultValue: any) => {
				if (key === 'http.healthCheck.urls')
					return ['https://api.example.com/health', 'https://cdn.example.com/health']
				if (key === 'http.healthCheck.timeout')
					return 5000
				return defaultValue
			})
		})

		it('should return healthy when all endpoints are healthy and circuit is closed', async () => {
			mockHttpClientService.isCircuitOpen.mockReturnValue(false)
			mockHttpClientService.getStats.mockReturnValue({
				totalRequests: 10,
				successfulRequests: 10,
				failedRequests: 0,
				circuitBreakerState: 'closed',
			})

			const mockResponse: AxiosResponse = {
				status: 200,
				data: 'OK',
				statusText: 'OK',
				headers: {},
				config: {} as any,
			}

			mockHttpClientService.get.mockResolvedValue(mockResponse)

			const result = await indicator.isHealthy('http')

			expect(result.http.status).toBe('up')
			expect(result.http.checks).toHaveLength(2)
			expect(result.http.checks.every((check: any) => check.success)).toBe(true)
		})

		it('should return unhealthy when some endpoints fail', async () => {
			mockHttpClientService.isCircuitOpen.mockReturnValue(false)
			mockHttpClientService.getStats.mockReturnValue({
				totalRequests: 10,
				successfulRequests: 8,
				failedRequests: 2,
				circuitBreakerState: 'closed',
			})

			const mockSuccessResponse: AxiosResponse = {
				status: 200,
				data: 'OK',
				statusText: 'OK',
				headers: {},
				config: {} as any,
			}

			mockHttpClientService.get
				.mockResolvedValueOnce(mockSuccessResponse)
				.mockRejectedValueOnce(new Error('Connection failed'))

			const result = await indicator.isHealthy('http')

			expect(result.http.status).toBe('down')
			expect(result.http.checks).toHaveLength(2)
			expect(result.http.checks[0].success).toBe(true)
			expect(result.http.checks[1].success).toBe(false)
		})

		it('should return unhealthy when circuit breaker is open even if endpoints are healthy', async () => {
			mockHttpClientService.isCircuitOpen.mockReturnValue(true)
			mockHttpClientService.getStats.mockReturnValue({
				totalRequests: 10,
				successfulRequests: 3,
				failedRequests: 7,
				circuitBreakerState: 'open',
			})

			const mockResponse: AxiosResponse = {
				status: 200,
				data: 'OK',
				statusText: 'OK',
				headers: {},
				config: {} as any,
			}

			mockHttpClientService.get.mockResolvedValue(mockResponse)

			const result = await indicator.isHealthy('http')

			expect(result.http.status).toBe('down')
			expect(result.http.circuitBreaker).toBe('open')
		})

		it('should handle timeout errors gracefully', async () => {
			mockHttpClientService.isCircuitOpen.mockReturnValue(false)
			mockHttpClientService.getStats.mockReturnValue({
				totalRequests: 5,
				successfulRequests: 4,
				failedRequests: 1,
				circuitBreakerState: 'closed',
			})

			mockHttpClientService.get.mockRejectedValue(new Error('Timeout'))

			const result = await indicator.isHealthy('http')

			expect(result.http.status).toBe('down')
			expect(result.http.checks.every((check: any) => !check.success)).toBe(true)
		})

		it('should include response times for successful requests', async () => {
			mockHttpClientService.isCircuitOpen.mockReturnValue(false)
			mockHttpClientService.getStats.mockReturnValue({
				totalRequests: 10,
				successfulRequests: 10,
				failedRequests: 0,
				circuitBreakerState: 'closed',
			})

			const mockResponse: AxiosResponse = {
				status: 200,
				data: 'OK',
				statusText: 'OK',
				headers: {},
				config: {} as any,
			}

			mockHttpClientService.get.mockImplementation(() => {
				return new Promise((resolve) => {
					setTimeout(() => resolve(mockResponse), 50)
				})
			})

			const result = await indicator.isHealthy('http')

			expect(result.http.status).toBe('up')
			expect(result.http.checks.every((check: any) => check.responseTime > 0)).toBe(true)
		})
	})

	describe('error Handling', () => {
		beforeEach(() => {
			mockConfigService.getOptional.mockImplementation((key: string, defaultValue: any) => {
				if (key === 'http.healthCheck.urls')
					return ['https://api.example.com/health']
				if (key === 'http.healthCheck.timeout')
					return 5000
				return defaultValue
			})
		})

		it('should handle unexpected errors gracefully', async () => {
			mockHttpClientService.isCircuitOpen.mockReturnValue(false)
			mockHttpClientService.getStats.mockReturnValue({
				totalRequests: 0,
				successfulRequests: 0,
				failedRequests: 0,
				circuitBreakerState: 'closed',
			})

			mockHttpClientService.get.mockRejectedValue(new Error('Unexpected error'))

			const result = await indicator.isHealthy('http')

			expect(result.http.status).toBe('down')
			expect(result.http.checks[0].success).toBe(false)
			expect(result.http.checks[0].error).toBe('Unexpected error')
		})
	})

	describe('getDetails', () => {
		it('should return indicator details', () => {
			const details = indicator.getDetails()

			expect(details).toEqual({
				name: 'HTTP Health Indicator',
				description: 'Monitors HTTP connection health',
				checks: [
					'Circuit breaker status',
					'External endpoint connectivity',
					'Response times',
					'Success rates',
				],
			})
		})
	})
})
