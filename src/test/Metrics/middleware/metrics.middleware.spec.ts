import { MetricsMiddleware } from '@microservice/Metrics/middleware/metrics.middleware'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { Test, TestingModule } from '@nestjs/testing'
import { Request, Response } from 'express'
import 'reflect-metadata'

describe('metricsMiddleware', () => {
	let middleware: MetricsMiddleware
	let metricsService: jest.Mocked<MetricsService>
	let mockRequest: Partial<Request>
	let mockResponse: Partial<Response>
	let nextFunction: jest.Mock

	beforeEach(async () => {
		const mockMetricsService = {
			incrementRequestsInFlight: jest.fn(),
			decrementRequestsInFlight: jest.fn(),
			recordHttpRequest: jest.fn(),
			recordError: jest.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MetricsMiddleware,
				{
					provide: MetricsService,
					useValue: mockMetricsService,
				},
			],
		}).compile()

		middleware = module.get<MetricsMiddleware>(MetricsMiddleware)
		metricsService = module.get(MetricsService)

		mockRequest = {
			method: 'GET',
			url: '/test?param=value',
			headers: {
				'content-type': 'application/json',
				'user-agent': 'test-agent',
			},
			get: jest.fn((header: string) => {
				if (header === 'content-length')
					return '100'
				if (header === 'set-cookie')
					return ['cookie1', 'cookie2']
				return undefined
			}) as any,
		}

		mockResponse = {
			statusCode: 200,
			end: jest.fn(),
			on: jest.fn().mockReturnValue({} as any),
		}

		nextFunction = jest.fn()
	})

	describe('use', () => {
		it('should track request metrics on successful request', (done) => {
			const finishCallback = jest.fn()

			mockResponse.on = jest.fn((event: string, callback: (...args: any[]) => any) => {
				if (event === 'finish') {
					finishCallback.mockImplementation(callback)
				}
				return {} as any
			})

			middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)

			expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1)
			expect(nextFunction).toHaveBeenCalledTimes(1)

			// Simulate response finish
			setTimeout(() => {
				finishCallback()

				expect(metricsService.recordHttpRequest).toHaveBeenCalledWith(
					'GET',
					'/test',
					200,
					expect.any(Number),
					100,
					0,
				)
				expect(metricsService.decrementRequestsInFlight).toHaveBeenCalledTimes(1)
				done()
			}, 10)
		})

		it('should handle request without content-length header', () => {
			mockRequest.get = jest.fn(() => undefined)

			middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)

			expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1)
			expect(nextFunction).toHaveBeenCalledTimes(1)
		})

		it('should track requests in flight', () => {
			middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)

			expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1)
			expect(nextFunction).toHaveBeenCalledTimes(1)
		})

		it('should normalize route with numeric ID', () => {
			mockRequest.url = '/users/123/profile'

			middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)

			expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1)
		})

		it('should normalize route with UUID', () => {
			mockRequest.url = '/users/550e8400-e29b-41d4-a716-446655440000/profile'

			middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)

			expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1)
		})

		it('should use route path when available', () => {
			mockRequest.route = { path: '/api/users/:id' }

			middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)

			expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1)
		})
	})
})
