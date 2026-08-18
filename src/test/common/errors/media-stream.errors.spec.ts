import { HttpStatus } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import {
	DefaultImageFallbackError,
	InvalidRequestError,
	MediaStreamError,
	ResourceStreamingError,
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

	describe('resourceStreamingError', () => {
		it('should create a streaming error with default values', () => {
			const error = new ResourceStreamingError()

			expect(error).toBeInstanceOf(MediaStreamError)
			expect(error.name).toBe('ResourceStreamingError')
			expect(error.message).toBe('Failed to stream resource')
			expect(error.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
			expect(error.code).toBe('RESOURCE_STREAMING_ERROR')
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
})
