import type { Request, Response } from 'express'
import type { Mock, MockedObject } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MetricsMiddleware, UNMATCHED_ROUTE } from '#microservice/Metrics/middleware/metrics.middleware'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import 'reflect-metadata'

describe('metricsMiddleware', () => {
	let middleware: MetricsMiddleware
	let metricsService: MockedObject<MetricsService>
	let mockRequest: Partial<Request>
	let mockResponse: Partial<Response>
	let nextFunction: Mock

	beforeEach(async () => {
		const mockMetricsService = {
			incrementRequestsInFlight: vi.fn(),
			decrementRequestsInFlight: vi.fn(),
			recordHttpRequest: vi.fn(),
			recordError: vi.fn(),
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
				'content-length': '100',
				'user-agent': 'test-agent',
			},
			get: vi.fn((header: string) => {
				if (header === 'content-length')
					return '100'
				if (header === 'set-cookie')
					return ['cookie1', 'cookie2']
				return undefined
			}) as any,
		}

		mockResponse = {
			statusCode: 200,
			end: vi.fn(),
			on: vi.fn().mockReturnValue({} as any),
		}

		nextFunction = vi.fn()
	})

	describe('use', () => {
		it('should track request metrics on successful request', async () => {
			const finishCallback = vi.fn()

			mockResponse.on = vi.fn((event: string, callback: (...args: any[]) => any) => {
				if (event === 'finish') {
					finishCallback.mockImplementation(callback)
				}
				return {} as any
			})

			middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)

			expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1)
			expect(nextFunction).toHaveBeenCalledTimes(1)

			// Simulate response finish
			await new Promise(resolve => setTimeout(resolve, 10))
			finishCallback()

			expect(metricsService.recordHttpRequest).toHaveBeenCalledWith(
				'GET',
				UNMATCHED_ROUTE,
				200,
				expect.any(Number),
				100,
				0,
			)
			expect(metricsService.decrementRequestsInFlight).toHaveBeenCalledTimes(1)
		})

		it('should handle request without content-length header', () => {
			mockRequest.get = vi.fn(() => undefined)

			middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)

			expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1)
			expect(nextFunction).toHaveBeenCalledTimes(1)
		})

		it('should track requests in flight', () => {
			middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)

			expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1)
			expect(nextFunction).toHaveBeenCalledTimes(1)
		})
	})

	describe('route label', () => {
		function runAndFinish(url: string, route?: { path: string }): void {
			mockRequest.url = url
			if (route) {
				mockRequest.route = route
			}

			const finishCallback = vi.fn()
			mockResponse.on = vi.fn((event: string, callback: (...args: any[]) => any) => {
				if (event === 'finish') {
					finishCallback.mockImplementation(callback)
				}
				return {} as any
			})

			middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)
			finishCallback()
		}

		it('is the registered route pattern, never the tenant or image in the path', () => {
			runAndFinish('/media_stream-image/media/acme/uploads/banner.jpg/800/600/cover/entropy/transparent/5/80.webp', { path: '/media_stream-image/*path' })

			expect(metricsService.recordHttpRequest).toHaveBeenCalledWith('GET', '/media_stream-image/*path', 200, expect.any(Number), 100, 0)
		})

		// A client can send any path; none of it may become a label value.
		it.each([
			'/users/123/profile',
			'/aZ9-random-segment/another/one',
			'/media_stream-image-typo/media/acme/uploads/x.png',
		])('collapses the unmatched path %s to one value', (url) => {
			runAndFinish(url)

			expect(metricsService.recordHttpRequest).toHaveBeenCalledWith('GET', UNMATCHED_ROUTE, 200, expect.any(Number), 100, 0)
		})

		it('carries no tenant argument', () => {
			runAndFinish('/health', { path: '/health' })

			expect(metricsService.recordHttpRequest.mock.calls[0]).toHaveLength(6)
		})
	})
})
