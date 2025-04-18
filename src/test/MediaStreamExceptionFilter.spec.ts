import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { MediaStreamError, ResourceNotFoundError } from '@microservice/Error/MediaStreamErrors'
import { MediaStreamExceptionFilter } from '@microservice/Error/MediaStreamExceptionFilter'
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'

describe('MediaStreamExceptionFilter', () => {
	let filter: MediaStreamExceptionFilter
	let mockArgumentsHost: ArgumentsHost
	let mockResponse: any
	let mockRequest: any
	let mockHttpContext: any
	let mockGetResponseFn: jest.Mock
	let mockGetRequestFn: jest.Mock
	let mockSwitchToHttpFn: jest.Mock
	let mockHttpAdapterHost: HttpAdapterHost
	let mockHttpAdapterReply: jest.Mock

	beforeEach(() => {
		mockRequest = {
			url: '/test/url',
			method: 'GET',
		}

		mockResponse = {}

		mockGetResponseFn = jest.fn().mockReturnValue(mockResponse)
		mockGetRequestFn = jest.fn().mockReturnValue(mockRequest)
		mockHttpContext = {
			getResponse: mockGetResponseFn,
			getRequest: mockGetRequestFn,
		}

		mockSwitchToHttpFn = jest.fn().mockReturnValue(mockHttpContext)
		mockArgumentsHost = {
			switchToHttp: mockSwitchToHttpFn,
		} as unknown as ArgumentsHost

		mockHttpAdapterReply = jest.fn()

		mockHttpAdapterHost = {
			httpAdapter: {
				reply: mockHttpAdapterReply,
				getRequestUrl: jest.fn().mockReturnValue('/test/url'),
			},
		} as unknown as HttpAdapterHost

		filter = new MediaStreamExceptionFilter(mockHttpAdapterHost)

		jest.spyOn(console, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		jest.restoreAllMocks()
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
			expect(typedErrorResponse.context).toEqual({ test: 'value' })
			expect(typedErrorResponse.path).toBe('/test/url')
			expect(typedErrorResponse.method).toBe('GET')
			expect(typedErrorResponse.timestamp).toBeDefined()
		})

		it('should handle ResourceNotFoundError', () => {
			const error = new ResourceNotFoundError('Resource not found', { resourceId: '123' })

			filter.catch(error, mockArgumentsHost)

			expect(mockHttpAdapterReply).toHaveBeenCalled()

			const [responseArg, errorResponseArg, statusArg] = mockHttpAdapterReply.mock.calls[0]

			expect(responseArg).toBe(mockResponse)
			expect(statusArg).toBe(HttpStatus.NOT_FOUND)

			const typedErrorResponse = errorResponseArg as Record<string, any>

			expect(typedErrorResponse.name).toBe('ResourceNotFoundError')
			expect(typedErrorResponse.message).toBe('Resource not found')
			expect(typedErrorResponse.code).toBe('RESOURCE_NOT_FOUND')
			expect(typedErrorResponse.context).toEqual({ resourceId: '123' })
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
})
