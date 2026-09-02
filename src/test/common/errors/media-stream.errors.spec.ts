import { HttpStatus } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import {
	CircuitBreakerOpenError,
	DefaultImageFallbackError,
	InvalidRequestError,
	MediaStreamError,
	UpstreamResourceTooLargeError,
} from '#microservice/common/errors/media-stream.errors'

describe('mediaStreamErrors', () => {
	describe('mediaStreamError', () => {
		it('should create a base error with default values', () => {
			const error = new MediaStreamError('Test error')

			expect(error).toBeInstanceOf(Error)
			expect(error.name).toBe('MediaStreamError')
			expect(error.message).toBe('Test error')
			expect(error.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
			expect(error.code).toBe('MEDIA_STREAM_ERROR')
			expect(error.context).toEqual({})
		})

		it('should create a base error with custom values', () => {
			const context = { test: 'value' }
			const error = new MediaStreamError(
				'Custom error',
				HttpStatus.BAD_REQUEST,
				'CUSTOM_ERROR',
				context,
			)

			expect(error.message).toBe('Custom error')
			expect(error.status).toBe(HttpStatus.BAD_REQUEST)
			expect(error.code).toBe('CUSTOM_ERROR')
			expect(error.context).toBe(context)
		})

		it('should convert to JSON correctly', () => {
			const error = new MediaStreamError('Test error')
			const json = error.toJSON()

			expect(json).toHaveProperty('name', 'MediaStreamError')
			expect(json).toHaveProperty('message', 'Test error')
			expect(json).toHaveProperty('status', HttpStatus.INTERNAL_SERVER_ERROR)
			expect(json).toHaveProperty('code', 'MEDIA_STREAM_ERROR')
			expect(json).toHaveProperty('context', {})
			expect(json).toHaveProperty('stack')
		})
	})

	describe('defaultImageFallbackError', () => {
		it('should create a fallback error with default values', () => {
			const error = new DefaultImageFallbackError()

			expect(error).toBeInstanceOf(MediaStreamError)
			expect(error.name).toBe('DefaultImageFallbackError')
			expect(error.message).toBe('Failed to serve default image')
			expect(error.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
			expect(error.code).toBe('DEFAULT_IMAGE_FALLBACK_ERROR')
		})
	})

	describe('invalidRequestError', () => {
		it('should create an invalid request error with default values', () => {
			const error = new InvalidRequestError()

			expect(error).toBeInstanceOf(MediaStreamError)
			expect(error.name).toBe('InvalidRequestError')
			expect(error.message).toBe('Invalid request parameters')
			expect(error.status).toBe(HttpStatus.BAD_REQUEST)
			expect(error.code).toBe('INVALID_REQUEST')
		})
	})
	describe('circuitBreakerOpenError', () => {
		it('is a 503 with a stable code', () => {
			const error = new CircuitBreakerOpenError({ name: 'http_client' })

			expect(error).toBeInstanceOf(MediaStreamError)
			expect(error.name).toBe('CircuitBreakerOpenError')
			expect(error.message).toBe('Circuit breaker is open')
			expect(error.status).toBe(HttpStatus.SERVICE_UNAVAILABLE)
			expect(error.code).toBe('CIRCUIT_BREAKER_OPEN')
			expect(error.context).toEqual({ name: 'http_client' })
		})
	})

	describe('upstreamResourceTooLargeError', () => {
		it('is a 502 with a default message', () => {
			const error = new UpstreamResourceTooLargeError()

			expect(error).toBeInstanceOf(MediaStreamError)
			expect(error.message).toBe('Upstream resource exceeds the size limit')
			expect(error.status).toBe(HttpStatus.BAD_GATEWAY)
			expect(error.code).toBe('UPSTREAM_RESOURCE_TOO_LARGE')
		})

		it('accepts a custom message and context', () => {
			const error = new UpstreamResourceTooLargeError('too big', { bytes: 1 })

			expect(error.message).toBe('too big')
			expect(error.context).toEqual({ bytes: 1 })
		})
	})
})
