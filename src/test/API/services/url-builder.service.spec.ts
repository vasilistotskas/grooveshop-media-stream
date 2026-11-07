import type { ImageProcessingContext, ImageProcessingParams } from '#microservice/API/types/image-source.types'
import { beforeEach, describe, expect, it } from 'vitest'
import { IMAGE_SOURCES } from '#microservice/API/config/image-sources.config'
import { UrlBuilderService } from '#microservice/API/services/url-builder.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

function createContext(overrides: Partial<ImageProcessingContext['source']> = {}, params: ImageProcessingParams = {}): ImageProcessingContext {
	return {
		source: {
			name: 'test-source',
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
		service = new UrlBuilderService(createConfigServiceMock({ 'backend.url': 'http://backend:8000' }))
	})

	it('should substitute backend.url and params into the URL pattern', () => {
		const url = service.buildResourceUrl(createContext())
		expect(url).toBe('http://backend:8000/media/uploads/blog%2Fcover.jpg')
	})

	it('should build a YouTube poster\'s URL on YouTube\'s image host, not the backend', () => {
		expect(service.buildResourceUrl({
			source: IMAGE_SOURCES.YOUTUBE_POSTER,
			params: { videoId: 'eIiZ-JHL5aw' },
			correlationId: 'test',
		})).toBe('https://i.ytimg.com/vi/eIiZ-JHL5aw/hqdefault.jpg')
	})

	it('should URI-encode parameter values', () => {
		const url = service.buildResourceUrl(createContext({}, { imagePath: 'φωτογραφία.jpg' }))
		expect(url).toBe(`http://backend:8000/media/uploads/${encodeURIComponent('φωτογραφία.jpg')}`)
	})

	it('should leave placeholders for undefined params', () => {
		const url = service.buildResourceUrl(createContext({ urlPattern: '{baseUrl}/x/{a}/{b}' }, { a: 'v', b: undefined }))
		expect(url).toBe('http://backend:8000/x/v/{b}')
	})

	it('should not mangle path segments that start with reserved-looking words', () => {
		const url = service.buildResourceUrl(createContext({}, { imagePath: 'online/styles/about.png' }))
		expect(url).toBe(`http://backend:8000/media/uploads/${encodeURIComponent('online/styles/about.png')}`)
	})
})
