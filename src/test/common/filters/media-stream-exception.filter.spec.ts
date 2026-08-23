import type { ArgumentsHost } from '@nestjs/common'
import type { Mock } from 'vitest'
import { HttpException, HttpStatus } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaStreamError } from '#microservice/common/errors/media-stream.errors'
import { MediaStreamExceptionFilter } from '#microservice/common/filters/media-stream-exception.filter'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

describe('mediaStreamExceptionFilter', () => {
	let filter: MediaStreamExceptionFilter
	let mockArgumentsHost: ArgumentsHost
	let mockResponse: any
	let mockRequest: any
	let mockHttpContext: any
	let mockGetResponseFn: Mock
	let mockGetRequestFn: Mock
	let mockSwitchToHttpFn: Mock
	let mockHttpAdapterHost: HttpAdapterHost
	let mockHttpAdapterReply: Mock
	let mockCorrelationService: CorrelationService

	beforeEach(() => {
		mockRequest = {
			url: '/test/url',
			method: 'GET',
		}

		mockResponse = {}

		mockGetResponseFn = vi.fn().mockReturnValue(mockResponse)
		mockGetRequestFn = vi.fn().mockReturnValue(mockRequest)
		mockHttpContext = {
			getResponse: mockGetResponseFn,
			getRequest: mockGetRequestFn,
		}

		mockSwitchToHttpFn = vi.fn().mockReturnValue(mockHttpContext)
		mockArgumentsHost = {
			switchToHttp: mockSwitchToHttpFn,
		} as unknown as ArgumentsHost

		mockHttpAdapterReply = vi.fn()

		mockHttpAdapterHost = {
			httpAdapter: {
				reply: mockHttpAdapterReply,
				getRequestUrl: vi.fn().mockReturnValue('/test/url'),
			},
		} as unknown as HttpAdapterHost

		mockCorrelationService = {
			getCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
		} as unknown as CorrelationService

		filter = new MediaStreamExceptionFilter(mockHttpAdapterHost, mockCorrelationService)

		vi.spyOn(console, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('catch', () => {
		it('should handle MediaStreamError', () => {
			const error = new MediaStreamError('Test error', HttpStatus.BAD_REQUEST, 'TEST_ERROR', { test: 'value' })

			filter.catch(error, mockArgumentsHost)

			expect(mockSwitchToHttpFn).toHaveBeenCalled()
			expect(mockGetResponseFn).toHaveBeenCalled()
			expect(mockGetRequestFn).toHaveBeenCalled()

			expect(mockHttpAdapterReply).toHaveBeenCalled()

			const [responseArg, errorResponseArg, statusArg] = mockHttpAdapterReply.mock.calls[0]

			expect(responseArg).toBe(mockResponse)
			expect(statusArg).toBe(HttpStatus.BAD_REQUEST)

			const typedErrorResponse = errorResponseArg as Record<string, any>

			expect(typedErrorResponse.name).toBe('MediaStreamError')
			expect(typedErrorResponse.message).toBe('Test error')
			expect(typedErrorResponse.code).toBe('TEST_ERROR')
			expect(typedErrorResponse.status).toBe(HttpStatus.BAD_REQUEST)
			expect(typedErrorResponse.context).toBeUndefined()
			expect(typedErrorResponse.path).toBe('/test/url')
			expect(typedErrorResponse.method).toBe('GET')
			expect(typedErrorResponse.timestamp).toBeDefined()
		})

		it('should handle a MediaStreamError with NOT_FOUND status', () => {
			const error = new MediaStreamError('Resource not found', HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', { resourceId: '123' })

			filter.catch(error, mockArgumentsHost)

			expect(mockHttpAdapterReply).toHaveBeenCalled()

			const [responseArg, errorResponseArg, statusArg] = mockHttpAdapterReply.mock.calls[0]

			expect(responseArg).toBe(mockResponse)
			expect(statusArg).toBe(HttpStatus.NOT_FOUND)

			const typedErrorResponse = errorResponseArg as Record<string, any>

			expect(typedErrorResponse.name).toBe('MediaStreamError')
			expect(typedErrorResponse.message).toBe('Resource not found')
			expect(typedErrorResponse.code).toBe('RESOURCE_NOT_FOUND')
			expect(typedErrorResponse.context).toBeUndefined()
		})

		it('should handle HttpException', () => {
			const error = new HttpException('Forbidden', HttpStatus.FORBIDDEN)

			filter.catch(error, mockArgumentsHost)

			expect(mockHttpAdapterReply).toHaveBeenCalled()

			const [responseArg, errorResponseArg, statusArg] = mockHttpAdapterReply.mock.calls[0]

			expect(responseArg).toBe(mockResponse)
			expect(statusArg).toBe(HttpStatus.FORBIDDEN)

			const typedErrorResponse = errorResponseArg as Record<string, any>

			expect(typedErrorResponse.name).toBe('HttpException')
			expect(typedErrorResponse.message).toBe('Forbidden')
			expect(typedErrorResponse.code).toBe(`HTTP_${HttpStatus.FORBIDDEN}`)
		})

		it('should handle HttpException with object response', () => {
			const errorResponse = {
				message: 'Validation failed',
				errors: ['Field is required'],
			}
			const error = new HttpException(errorResponse, HttpStatus.BAD_REQUEST)

			filter.catch(error, mockArgumentsHost)

			expect(mockHttpAdapterReply).toHaveBeenCalled()

			const [responseArg, errorResponseArg, statusArg] = mockHttpAdapterReply.mock.calls[0]

			expect(responseArg).toBe(mockResponse)
			expect(statusArg).toBe(HttpStatus.BAD_REQUEST)

			const typedErrorResponse = errorResponseArg as Record<string, any>

			expect(typedErrorResponse.message).toBe('Validation failed')
			expect(typedErrorResponse.code).toBe(`HTTP_${HttpStatus.BAD_REQUEST}`)
		})

		it('should handle unknown errors', () => {
			const error = new Error('Unknown error')

			filter.catch(error, mockArgumentsHost)

			expect(mockHttpAdapterReply).toHaveBeenCalled()

			const [responseArg, errorResponseArg, statusArg] = mockHttpAdapterReply.mock.calls[0]

			expect(responseArg).toBe(mockResponse)
			expect(statusArg).toBe(HttpStatus.INTERNAL_SERVER_ERROR)

			const typedErrorResponse = errorResponseArg as Record<string, any>

			expect(typedErrorResponse.name).toBe('InternalServerError')
			expect(typedErrorResponse.message).toBe('An unexpected error occurred')
			expect(typedErrorResponse.code).toBe('INTERNAL_SERVER_ERROR')
		})
	})

	describe('log level by status', () => {
		let warnSpy: Mock
		let errorSpy: Mock

		beforeEach(() => {
			warnSpy = vi.spyOn(CorrelatedLogger, 'warn').mockImplementation(() => {}) as unknown as Mock
			errorSpy = vi.spyOn(CorrelatedLogger, 'error').mockImplementation(() => {}) as unknown as Mock
		})

		it('logs a 4xx HttpException at WARN, not ERROR', () => {
			// A stale pre-multi-tenant media path from a crawler surfaces as
			// a 404 — an expected client error, not a server fault.
			filter.catch(new HttpException('No image source matches path: media/uploads/blog/x.png', HttpStatus.NOT_FOUND), mockArgumentsHost)

			expect(warnSpy).toHaveBeenCalledTimes(1)
			expect(errorSpy).not.toHaveBeenCalled()
		})

		it('logs a 400 HttpException at WARN, not ERROR', () => {
			filter.catch(new HttpException('Bad params', HttpStatus.BAD_REQUEST), mockArgumentsHost)

			expect(warnSpy).toHaveBeenCalledTimes(1)
			expect(errorSpy).not.toHaveBeenCalled()
		})

		it('logs a 5xx HttpException at ERROR, not WARN', () => {
			filter.catch(new HttpException('Upstream down', HttpStatus.BAD_GATEWAY), mockArgumentsHost)

			expect(errorSpy).toHaveBeenCalledTimes(1)
			expect(warnSpy).not.toHaveBeenCalled()
		})

		it('logs an unknown (500) error at ERROR, not WARN', () => {
			filter.catch(new Error('boom'), mockArgumentsHost)

			expect(errorSpy).toHaveBeenCalledTimes(1)
			expect(warnSpy).not.toHaveBeenCalled()
		})

		it('logs a 4xx MediaStreamError at WARN', () => {
			const err = new MediaStreamError('bad input', HttpStatus.BAD_REQUEST, 'BAD_INPUT')
			filter.catch(err, mockArgumentsHost)

			expect(warnSpy).toHaveBeenCalledTimes(1)
			expect(errorSpy).not.toHaveBeenCalled()
		})
	})
})
