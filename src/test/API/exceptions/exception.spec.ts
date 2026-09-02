import { describe, expect, it } from 'vitest'

import UnableToFetchResourceException from '#microservice/API/exceptions/unable-to-fetch-resource.exception'
import UnableToStoreFetchedResourceException from '#microservice/API/exceptions/unable-to-store-fetched-resource.exception'

describe('unableToFetchResourceException', () => {
	it('should create an error with the correct message', () => {
		const resource = 'http://example.com/image.jpg'
		// Production code uses a generic message; the resource URL is in context, not the message
		const expectedMessage = 'Requested resource could not be fetched'

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
