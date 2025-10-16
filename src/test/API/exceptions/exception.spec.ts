import {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	ResizeOptions,
	SupportedResizeFormats,
} from '@microservice/API/dto/cache-image-request.dto'
import RequestedResizeTargetTooLargeException from '@microservice/API/exceptions/requested-resize-target-too-large.exception'

import UnableToFetchResourceException from '@microservice/API/exceptions/unable-to-fetch-resource.exception'
import UnableToStoreFetchedResourceException from '@microservice/API/exceptions/unable-to-store-fetched-resource.exception'
import { describe, expect, it } from 'vitest'

describe('requestedResizeTargetTooLargeException', () => {
	it('should create an error with the correct message', () => {
		const resizeRequest: ResizeOptions = {
			width: 5000,
			height: 4000,
			fit: FitOptions.contain,
			position: PositionOptions.center,
			format: SupportedResizeFormats.webp,
			background: BackgroundOptions.transparent,
			trimThreshold: 5,
			quality: 90,
		}

		const allowedPixelCount = 20000000
		const expectedMessage = `Requested resize target (${resizeRequest.width}x${resizeRequest.height}) exceeded maximum allowed size of ${allowedPixelCount} total pixels`

		const exception = new RequestedResizeTargetTooLargeException(resizeRequest, allowedPixelCount)

		expect(exception.message).toBe(expectedMessage)
	})

	it('should be an instance of Error', () => {
		const resizeRequest: ResizeOptions = {
			width: 1000,
			height: 1000,
			fit: FitOptions.contain,
			position: PositionOptions.center,
			format: SupportedResizeFormats.webp,
			background: BackgroundOptions.transparent,
			trimThreshold: 5,
			quality: 90,
		}

		const allowedPixelCount = 1000000
		const exception = new RequestedResizeTargetTooLargeException(resizeRequest, allowedPixelCount)

		expect(exception).toBeInstanceOf(Error)
	})
})

describe('unableToFetchResourceException', () => {
	it('should create an error with the correct message', () => {
		const resource = 'http://example.com/image.jpg'
		const expectedMessage = `Requested resource: ${resource} couldn't be fetched`

		const exception = new UnableToFetchResourceException(resource)

		expect(exception.message).toBe(expectedMessage)
	})

	it('should be an instance of Error', () => {
		const resource = 'http://example.com/image.jpg'
		const exception = new UnableToFetchResourceException(resource)

		expect(exception).toBeInstanceOf(Error)
	})
})

describe('unableToStoreFetchedResourceException', () => {
	it('should create an error with the correct message', () => {
		const resource = 'http://example.com/image.jpg'
		const expectedMessage = `Requested resource: ${resource} couldn't be stored`

		const exception = new UnableToStoreFetchedResourceException(resource)

		expect(exception.message).toBe(expectedMessage)
	})

	it('should be an instance of Error', () => {
		const resource = 'http://example.com/image.jpg'
		const exception = new UnableToStoreFetchedResourceException(resource)

		expect(exception).toBeInstanceOf(Error)
	})
})
