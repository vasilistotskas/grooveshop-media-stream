import type { ImageProcessingContext } from '#microservice/API/types/image-source.types'
import * as process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UrlBuilderService } from '#microservice/API/services/url-builder.service'

function createContext(overrides: Partial<ImageProcessingContext['source']> = {}, params: Record<string, string | null> = {}): ImageProcessingContext {
	return {
		source: {
			name: 'test-source',
			baseUrl: 'http://backend:8000',
			urlPattern: '{baseUrl}/media/uploads/{imagePath}',
			routePattern: 'media/uploads/:imagePath+',
			routeParams: ['imagePath'],
			...overrides,
		},
		params: { imagePath: 'blog/cover.jpg', ...params },
		correlationId: 'test-correlation-id',
	}
}

describe('urlBuilderService', () => {
	let service: UrlBuilderService

	beforeEach(() => {
		service = new UrlBuilderService()
	})

	afterEach(() => {
		delete process.env.TEST_URL_BUILDER_BACKEND
	})

	it('should substitute baseUrl and params into the URL pattern', () => {
		const url = service.buildResourceUrl(createContext())
		expect(url).toBe('http://backend:8000/media/uploads/blog%2Fcover.jpg')
	})

	it('should URI-encode parameter values', () => {
		const url = service.buildResourceUrl(createContext({}, { imagePath: 'φωτογραφία.jpg' }))
		expect(url).toBe(`http://backend:8000/media/uploads/${encodeURIComponent('φωτογραφία.jpg')}`)
	})

	it('should skip null and undefined params', () => {
		const url = service.buildResourceUrl(createContext({ urlPattern: '{baseUrl}/x/{a}/{b}' }, { a: 'v', b: null }))
		expect(url).toBe('http://backend:8000/x/v/{b}')
	})

	it('should resolve baseUrl from an environment variable key', () => {
		process.env.TEST_URL_BUILDER_BACKEND = 'https://assets.example.com'
		const url = service.buildResourceUrl(createContext({ baseUrl: 'TEST_URL_BUILDER_BACKEND' }))
		expect(url).toBe('https://assets.example.com/media/uploads/blog%2Fcover.jpg')
	})

	it('should throw when the environment variable is missing', () => {
		expect(() => service.buildResourceUrl(createContext({ baseUrl: 'DOES_NOT_EXIST_ENV_KEY' })))
			.toThrow(/Environment variable 'DOES_NOT_EXIST_ENV_KEY' not found/)
	})

	it('should throw when the source has no baseUrl', () => {
		expect(() => service.buildResourceUrl(createContext({ baseUrl: '' })))
			.toThrow(/must specify a baseUrl/)
	})
})
