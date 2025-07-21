import { TimingMiddleware } from '@microservice/Correlation/middleware/timing.middleware'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { Test, TestingModule } from '@nestjs/testing'
import { NextFunction, Request, Response } from 'express'

describe('timingMiddleware', () => {
	let middleware: TimingMiddleware
	let correlationService: CorrelationService
	let mockRequest: Partial<Request>
	let mockResponse: any
	let mockNext: NextFunction

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [CorrelationService],
		}).compile()

		correlationService = module.get<CorrelationService>(CorrelationService)
		middleware = new TimingMiddleware(correlationService)

		mockRequest = {
			method: 'GET',
			url: '/test',
		}

		mockResponse = {
			setHeader: jest.fn(),
			statusCode: 200,
			on: jest.fn((event, callback) => {
				if (event === 'finish') {
					setTimeout(callback, 10)
				}
			}),
		}

		mockNext = jest.fn()
	})

	afterEach(() => {
		correlationService.clearContext()
	})

	describe('use', () => {
		it('should call next function immediately', () => {
			middleware.use(mockRequest as Request, mockResponse as Response, mockNext)

			expect(mockNext).toHaveBeenCalled()
		})

		it('should set response time header on finish event', (done) => {
			jest.spyOn(correlationService, 'updateContext')
			jest.spyOn(correlationService, 'getContext').mockReturnValue({
				correlationId: 'test-id',
				timestamp: Date.now(),
				clientIp: '127.0.0.1',
				method: 'GET',
				url: '/test',
				startTime: BigInt(Date.now() * 1000000),
			})

			middleware.use(mockRequest as Request, mockResponse as Response, mockNext)

			setTimeout(() => {
				expect(mockResponse.setHeader).toHaveBeenCalledWith(
					'x-response-time',
					expect.stringMatching(/^\d+\.\d{2}ms$/),
				)
				expect(correlationService.updateContext).toHaveBeenCalled()
				done()
			}, 20)
		})

		it('should log request completion with timing info', (done) => {
			const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

			jest.spyOn(correlationService, 'getContext').mockReturnValue({
				correlationId: 'test-correlation-id',
				timestamp: Date.now(),
				clientIp: '127.0.0.1',
				method: 'GET',
				url: '/test',
				startTime: BigInt(Date.now() * 1000000),
			})

			middleware.use(mockRequest as Request, mockResponse as Response, mockNext)

			setTimeout(() => {
				expect(consoleSpy).toHaveBeenCalledWith(
					expect.stringMatching(/\[test-correlation-id\] GET \/test - 200 - \d+\.\d{2}ms/),
				)

				consoleSpy.mockRestore()
				done()
			}, 20)
		})

		it('should handle missing correlation context gracefully', (done) => {
			const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
			jest.spyOn(correlationService, 'getContext').mockReturnValue(null)

			middleware.use(mockRequest as Request, mockResponse as Response, mockNext)

			setTimeout(() => {
				expect(mockResponse.setHeader).toHaveBeenCalledWith(
					'x-response-time',
					expect.stringMatching(/^\d+\.\d{2}ms$/),
				)
				expect(consoleSpy).not.toHaveBeenCalled()

				consoleSpy.mockRestore()
				done()
			}, 20)
		})

		it('should update context with start time', (done) => {
			const updateContextSpy = jest.spyOn(correlationService, 'updateContext')
			jest.spyOn(correlationService, 'getContext').mockReturnValue({
				correlationId: 'test-id',
				timestamp: Date.now(),
				clientIp: '127.0.0.1',
				method: 'GET',
				url: '/test',
				startTime: BigInt(Date.now() * 1000000),
			})

			middleware.use(mockRequest as Request, mockResponse as Response, mockNext)

			setTimeout(() => {
				expect(updateContextSpy).toHaveBeenCalledWith({
					startTime: expect.any(BigInt),
				})
				done()
			}, 20)
		})
	})
})
