import CacheImageRequest, { BackgroundOptions, FitOptions, PositionOptions, ResizeOptions, SupportedResizeFormats } from '@microservice/API/dto/cache-image-request.dto'
import ResourceMetaData, {
	defaultPrivateTTL,
	defaultPublicTTL,
	resourceMetaVersion,
} from '@microservice/HTTP/dto/resource-meta-data.dto'
import ManipulationJobResult from '@microservice/Queue/dto/manipulation-job-result.dto'
import { describe, expect, it } from 'vitest'

describe('resizeOptions', () => {
	it('should set default values', () => {
		const resizeOptions = new ResizeOptions()

		expect(resizeOptions.width).toBeNull()
		expect(resizeOptions.height).toBeNull()
		expect(resizeOptions.fit).toBe(FitOptions.contain)
		expect(resizeOptions.position).toBe(PositionOptions.entropy)
		expect(resizeOptions.format).toBe(SupportedResizeFormats.webp)
		expect(resizeOptions.background).toBe(BackgroundOptions.white)
		expect(resizeOptions.trimThreshold).toBeNull()
		expect(resizeOptions.quality).toBe(100)
	})

	it('should accept custom values', () => {
		const customOptions = {
			width: 500,
			height: 400,
			fit: FitOptions.cover,
			position: PositionOptions.center,
			format: SupportedResizeFormats.jpeg,
			background: '#FF0000',
			trimThreshold: 10,
			quality: 80,
		}

		const resizeOptions = new ResizeOptions(customOptions)

		expect(resizeOptions.width).toBe(500)
		expect(resizeOptions.height).toBe(400)
		expect(resizeOptions.fit).toBe(FitOptions.cover)
		expect(resizeOptions.position).toBe(PositionOptions.center)
		expect(resizeOptions.format).toBe(SupportedResizeFormats.jpeg)
		expect(resizeOptions.background).toEqual({ r: 255, g: 0, b: 0, alpha: 1 })
		expect(resizeOptions.trimThreshold).toBe(10)
		expect(resizeOptions.quality).toBe(80)
	})

	it('should handle transparent background correctly', () => {
		const resizeOptions = new ResizeOptions({ background: 'transparent' })

		expect(resizeOptions.background).toEqual({ r: 0, g: 0, b: 0, alpha: 0 })
	})

	it('should delete width and height when set to null', () => {
		const resizeOptions = new ResizeOptions({ width: null, height: null })

		expect(resizeOptions.width).toBeUndefined()
		expect(resizeOptions.height).toBeUndefined()
	})

	it('should handle default values for quality and trimThreshold', () => {
		const resizeOptions = new ResizeOptions({ quality: undefined, trimThreshold: null })

		expect(resizeOptions.quality).toBe(100)
		expect(resizeOptions.trimThreshold).toBeNull()
	})
})

describe('cacheImageRequest', () => {
	it('should set default values for CacheImageRequest', () => {
		const cacheImageRequest = new CacheImageRequest()

		expect(cacheImageRequest.resourceTarget).toBe('')
		expect(cacheImageRequest.ttl).toBeUndefined()
		expect(cacheImageRequest.resizeOptions).toBeDefined()
	})

	it('should accept custom values', () => {
		const resizeOptions = new ResizeOptions({ width: 100, height: 200 })
		const customRequest = {
			resourceTarget: 'http://example.com/image.jpg',
			ttl: 3600,
			resizeOptions,
		}

		const cacheImageRequest = new CacheImageRequest(customRequest)

		expect(cacheImageRequest.resourceTarget).toBe('http://example.com/image.jpg')
		expect(cacheImageRequest.ttl).toBe(3600)
		expect(cacheImageRequest.resizeOptions).toBe(resizeOptions)
	})

	it('should handle partial input', () => {
		const customRequest = {
			resourceTarget: 'http://example.com/image.jpg',
		}

		const cacheImageRequest = new CacheImageRequest(customRequest)

		expect(cacheImageRequest.resourceTarget).toBe('http://example.com/image.jpg')
		expect(cacheImageRequest.ttl).toBeUndefined()
		expect(cacheImageRequest.resizeOptions).toBeDefined()
	})
})

describe('manipulationJobResult', () => {
	it('should create an instance with default values', () => {
		const result = new ManipulationJobResult()
		expect(result.size).toBe('')
		expect(result.format).toBe('')
	})

	it('should create an instance with provided data', () => {
		const data = { size: '1024', format: 'webp' }
		const result = new ManipulationJobResult(data)
		expect(result.size).toBe('1024')
		expect(result.format).toBe('webp')
	})

	it('should handle partial input', () => {
		const data = { size: '2048' }
		const result = new ManipulationJobResult(data)
		expect(result.size).toBe('2048')
		expect(result.format).toBe('')
	})
})

describe('resourceMetaData', () => {
	it('should create an instance with default values', () => {
		const metaData = new ResourceMetaData()

		expect(metaData.version).toBe(resourceMetaVersion)
		expect(metaData.publicTTL).toBe(defaultPublicTTL)
		expect(metaData.privateTTL).toBe(defaultPrivateTTL)
		expect(metaData.size).toBe('')
		expect(metaData.format).toBe('')
		expect(metaData.dateCreated).toBeDefined()
	})

	it('should create an instance with provided data', () => {
		const data = {
			version: 2,
			size: '2048',
			format: 'png',
			dateCreated: Date.now(),
			privateTTL: 1000,
			publicTTL: 2000,
		}

		const metaData = new ResourceMetaData(data)

		expect(metaData.version).toBe(2)
		expect(metaData.size).toBe('2048')
		expect(metaData.format).toBe('png')
		expect(metaData.dateCreated).toBe(data.dateCreated)
		expect(metaData.privateTTL).toBe(1000)
		expect(metaData.publicTTL).toBe(2000)
	})

	it('should handle partial input and fallback to default values', () => {
		const data = { size: '4096', format: 'jpeg' }
		const metaData = new ResourceMetaData(data)

		expect(metaData.size).toBe('4096')
		expect(metaData.format).toBe('jpeg')
		expect(metaData.version).toBe(resourceMetaVersion)
		expect(metaData.publicTTL).toBe(defaultPublicTTL)
		expect(metaData.privateTTL).toBe(defaultPrivateTTL)
		expect(metaData.dateCreated).toBeDefined()
	})
})
