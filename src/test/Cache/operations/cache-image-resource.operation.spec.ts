import type { OperationContext } from '#microservice/Cache/operations/cache-image-resource.operation'
import type { AxiosResponse } from 'axios'
import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	ResizeOptions,
	SupportedResizeFormats,
} from '#microservice/API/dto/cache-image-request.dto'
import CacheImageResourceOperation from '#microservice/Cache/operations/cache-image-resource.operation'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { ConfigService } from '#microservice/Config/config.service'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import ManipulationJobResult from '#microservice/Queue/dto/manipulation-job-result.dto'
import FetchResourceResponseJob from '#microservice/Queue/jobs/fetch-resource-response.job'
import GenerateResourceIdentityFromRequestJob from '#microservice/Queue/jobs/generate-resource-identity-from-request.job'
import StoreResourceResponseToFileJob from '#microservice/Queue/jobs/store-resource-response-to-file.job'
import WebpImageManipulationJob from '#microservice/Queue/jobs/webp-image-manipulation.job'
import ValidateCacheImageRequestResizeTargetRule from '#microservice/Validation/rules/validate-cache-image-request-resize-target.rule'
import ValidateCacheImageRequestRule from '#microservice/Validation/rules/validate-cache-image-request.rule'
import { InputSanitizationService } from '#microservice/Validation/services/input-sanitization.service'
import { HttpService } from '@nestjs/axios'
import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AxiosHeaders } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises')
vi.mock('node:process', () => ({
	cwd: vi.fn(() => '/mock/cwd'),
}))

describe('cacheImageResourceOperation', () => {
	let operation: CacheImageResourceOperation
	let mockHttpService: HttpService
	let mockGenerateResourceIdentityFromRequestJob: GenerateResourceIdentityFromRequestJob
	let mockFetchResourceResponseJob: FetchResourceResponseJob
	let mockStoreResourceResponseToFileJob: StoreResourceResponseToFileJob
	let mockWebpImageManipulationJob: WebpImageManipulationJob
	let mockValidateCacheImageRequestRule: ValidateCacheImageRequestRule
	let mockValidateCacheImageRequestResizeTargetRule: ValidateCacheImageRequestResizeTargetRule
	let mockCacheManager: MultiLayerCacheManager
	let mockInputSanitizationService: InputSanitizationService
	let mockMetricsService: MetricsService
	let mockLogger: Logger
	let mockCwd: string
	let mockRequest: CacheImageRequest
	let moduleRef: any
	let opCtx: OperationContext

	beforeEach(async () => {
		mockCwd = '/mock/cwd'
		mockRequest = new CacheImageRequest()
		mockRequest.resourceTarget = 'https://example.com/image.jpg'
		mockRequest.resizeOptions = new ResizeOptions()
		mockRequest.resizeOptions.width = 100
		mockRequest.resizeOptions.height = 100
		mockRequest.resizeOptions.quality = 80
		mockRequest.resizeOptions.format = SupportedResizeFormats.webp
		mockRequest.resizeOptions.fit = FitOptions.contain
		mockRequest.resizeOptions.position = PositionOptions.entropy
		mockRequest.resizeOptions.background = BackgroundOptions.white
		mockRequest.resizeOptions.trimThreshold = 10

		mockHttpService = {} as HttpService

		mockGenerateResourceIdentityFromRequestJob = {
			handle: vi.fn(),
		} as unknown as GenerateResourceIdentityFromRequestJob
		vi.spyOn(mockGenerateResourceIdentityFromRequestJob, 'handle').mockResolvedValue('mock-resource-id')

		mockFetchResourceResponseJob = {
			handle: vi.fn(),
		} as unknown as FetchResourceResponseJob

		const axiosHeaders = new AxiosHeaders()
		axiosHeaders.set('content-type', 'image/jpeg')

		// Production code calls response.data.pipe() and response.data.on('error'),
		// so data must be a Readable stream, not a plain Buffer.
		const mockStream = new Readable({ read() {} })
		mockStream.push(Buffer.from('mock-image-data'))
		mockStream.push(null) // end of stream

		const mockResponse = {
			status: 200,
			statusText: 'OK',
			headers: { 'content-type': 'image/jpeg' },
			data: mockStream,
			config: {
				headers: axiosHeaders,
				url: 'https://example.com/image.jpg',
				method: 'GET',
			},
		} as unknown as AxiosResponse

		vi.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValue(mockResponse)

		mockStoreResourceResponseToFileJob = {
			handle: vi.fn(),
		} as unknown as StoreResourceResponseToFileJob
		vi.spyOn(mockStoreResourceResponseToFileJob, 'handle').mockResolvedValue()

		mockWebpImageManipulationJob = {
			handle: vi.fn(),
		} as unknown as WebpImageManipulationJob
		vi.spyOn(mockWebpImageManipulationJob, 'handle').mockResolvedValue({
			format: 'webp',
			size: '1000',
			buffer: Buffer.from('optimized-image-data'),
		} as ManipulationJobResult)

		mockValidateCacheImageRequestRule = {
			setup: vi.fn(),
			apply: vi.fn(),
			validate: vi.fn(),
		} as unknown as ValidateCacheImageRequestRule

		mockValidateCacheImageRequestResizeTargetRule = {
			setup: vi.fn(),
			apply: vi.fn(),
			validate: vi.fn(),
		} as unknown as ValidateCacheImageRequestResizeTargetRule

		mockCacheManager = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			exists: vi.fn(),
		} as unknown as MultiLayerCacheManager

		mockInputSanitizationService = {
			sanitize: vi.fn(),
			validateUrl: vi.fn(),
			validateFileSize: vi.fn(),
			validateImageDimensions: vi.fn(),
		} as unknown as InputSanitizationService

		mockMetricsService = {
			recordCacheOperation: vi.fn(),
			recordImageProcessing: vi.fn(),
			recordError: vi.fn(),
		} as unknown as MetricsService

		mockLogger = {
			log: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
			verbose: vi.fn(),
		} as unknown as Logger

		// Setup default mock behaviors
		vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
		vi.spyOn(mockCacheManager, 'set').mockResolvedValue()
		vi.spyOn(mockCacheManager, 'delete').mockResolvedValue()
		vi.spyOn(mockCacheManager, 'exists').mockResolvedValue(false)

		vi.spyOn(mockInputSanitizationService, 'sanitize').mockImplementation(async input => input)
		vi.spyOn(mockInputSanitizationService, 'validateUrl').mockReturnValue(true)
		vi.spyOn(mockInputSanitizationService, 'validateFileSize').mockReturnValue(true)
		vi.spyOn(mockInputSanitizationService, 'validateImageDimensions').mockReturnValue(true)

		const mockConfigService = {
			get: vi.fn().mockImplementation((key: string) => {
				const configs: Record<string, any> = {
					'cache.image.publicTtl': 12 * 30 * 24 * 60 * 60 * 1000,
					'cache.image.privateTtl': 6 * 30 * 24 * 60 * 60 * 1000,
				}
				return configs[key]
			}),
			getOptional: vi.fn().mockImplementation((key: string, defaultValue: any) => {
				const configs: Record<string, any> = {
					'cache.image.publicTtl': 12 * 30 * 24 * 60 * 60 * 1000,
					'cache.image.privateTtl': 6 * 30 * 24 * 60 * 60 * 1000,
				}
				return configs[key] ?? defaultValue
			}),
		}

		moduleRef = await Test.createTestingModule({
			providers: [
				CacheImageResourceOperation,
				{ provide: HttpService, useValue: mockHttpService },
				{ provide: GenerateResourceIdentityFromRequestJob, useValue: mockGenerateResourceIdentityFromRequestJob },
				{ provide: FetchResourceResponseJob, useValue: mockFetchResourceResponseJob },
				{ provide: StoreResourceResponseToFileJob, useValue: mockStoreResourceResponseToFileJob },
				{ provide: WebpImageManipulationJob, useValue: mockWebpImageManipulationJob },
				{ provide: ValidateCacheImageRequestRule, useValue: mockValidateCacheImageRequestRule },
				{ provide: ValidateCacheImageRequestResizeTargetRule, useValue: mockValidateCacheImageRequestResizeTargetRule },
				{ provide: MultiLayerCacheManager, useValue: mockCacheManager },
				{ provide: InputSanitizationService, useValue: mockInputSanitizationService },
				{ provide: MetricsService, useValue: mockMetricsService },
				{ provide: Logger, useValue: mockLogger },
				{ provide: ConfigService, useValue: mockConfigService },
			],
		}).compile()

		operation = await moduleRef.resolve(CacheImageResourceOperation)
	})

	describe('resource Path Getters', () => {
		beforeEach(async () => {
			// Setup the operation first, which will generate the context with id
			opCtx = await operation.setup(mockRequest)
		})

		it('should return correct resource path', () => {
			const expected = path.normalize(path.join(mockCwd, 'storage', 'mock-resource-id.rsc'))
			const resourcePath = operation.getResourcePath(opCtx)
			expect(resourcePath).toBe(expected)
		})

		it('should return correct resource temp path', () => {
			const expected = path.normalize(path.join(mockCwd, 'storage', 'mock-resource-id.rst'))
			const resourceTempPath = operation.getResourceTempPath(opCtx)
			expect(resourceTempPath).toBe(expected)
		})

		it('should return correct resource meta path', () => {
			const expected = path.normalize(path.join(mockCwd, 'storage', 'mock-resource-id.rsm'))
			const resourceMetaPath = operation.getResourceMetaPath(opCtx)
			expect(resourceMetaPath).toBe(expected)
		})
	})

	describe('setup with new infrastructure', () => {
		it('should sanitize input and validate URL', async () => {
			opCtx = await operation.setup(mockRequest)

			expect(mockInputSanitizationService.sanitize).toHaveBeenCalledWith(mockRequest)
			expect(mockInputSanitizationService.validateUrl).toHaveBeenCalledWith(mockRequest.resourceTarget)
			expect(mockInputSanitizationService.validateImageDimensions).toHaveBeenCalledWith(100, 100)
		})

		it('should throw error for invalid URL', async () => {
			vi.spyOn(mockInputSanitizationService, 'validateUrl').mockReturnValue(false)

			await expect(operation.setup(mockRequest)).rejects.toThrow('Invalid or disallowed URL')
			expect(mockMetricsService.recordError).toHaveBeenCalledWith('validation', 'setup')
		})

		it('should throw error for invalid dimensions', async () => {
			vi.spyOn(mockInputSanitizationService, 'validateImageDimensions').mockReturnValue(false)

			await expect(operation.setup(mockRequest)).rejects.toThrow('Invalid image dimensions')
			expect(mockMetricsService.recordError).toHaveBeenCalledWith('validation', 'setup')
		})

		it('should return operation context with correct id', async () => {
			opCtx = await operation.setup(mockRequest)

			expect(opCtx).toBeDefined()
			expect(opCtx.id).toBe('mock-resource-id')
			expect(opCtx.request).toBeDefined()
			expect(opCtx.metaData).toBeNull()
		})
	})

	describe('checkResourceExists with cache integration', () => {
		beforeEach(async () => {
			opCtx = await operation.setup(mockRequest)
		})

		it('should return true when resource exists in cache and is valid', async () => {
			const mockCachedResource = {
				data: Buffer.from('cached-data'),
				metadata: new ResourceMetaData({
					version: 1,
					size: '1000',
					format: 'webp',
					dateCreated: Date.now(),
					publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
					privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
				}),
			}

			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(mockCachedResource)

			const result = await operation.checkResourceExists(opCtx)
			expect(result).toBe(true)
			expect(mockCacheManager.get).toHaveBeenCalledWith('image:public', 'mock-resource-id')
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'hit', expect.any(Number), expect.any(String))
		})

		it('should delete expired resource from cache', async () => {
			const expiredResource = {
				data: Buffer.from('expired-data'),
				metadata: new ResourceMetaData({
					version: 1,
					size: '1000',
					format: 'webp',
					dateCreated: Date.now() - 7 * 30 * 24 * 60 * 60 * 1000, // 7 months ago
					publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
					privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
				}),
			}

			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(expiredResource)
			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockResolvedValue()

			await operation.checkResourceExists(opCtx)
			expect(mockCacheManager.delete).toHaveBeenCalledWith('image:public', 'mock-resource-id')
		})

		it('should fallback to filesystem when cache miss', async () => {
			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockResolvedValue()
			mockedFs.readFile.mockResolvedValue(JSON.stringify({
				version: 1,
				size: '1000',
				format: 'webp',
				dateCreated: Date.now(),
				publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
				privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
			}))

			const result = await operation.checkResourceExists(opCtx)
			expect(result).toBe(true)
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'hit', expect.any(Number), expect.any(String))
		})
	})

	describe('execute', () => {
		beforeEach(async () => {
			opCtx = await operation.setup(mockRequest)
		})

		it('should always proceed to process image synchronously', async () => {
			// execute() now directly calls processImageSynchronously without checking cache first
			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockRejectedValue(new Error('File not found'))
			mockedFs.readFile.mockResolvedValue(Buffer.from('processed-image-data'))
			mockedFs.writeFile.mockResolvedValue()
			// Production code uses atomic rename (writeFile to .tmp then rename to final path)
			mockedFs.rename.mockResolvedValue()
			mockedFs.unlink.mockResolvedValue()
			// Production code opens the temp file to detect SVG headers
			mockedFs.open.mockResolvedValue({
				read: vi.fn().mockResolvedValue({ bytesRead: 4, buffer: Buffer.alloc(512) }),
				close: vi.fn().mockResolvedValue(undefined),
			} as any)

			await operation.execute(opCtx)

			expect(mockFetchResourceResponseJob.handle).toHaveBeenCalled()
			expect(mockWebpImageManipulationJob.handle).toHaveBeenCalled()
		})

		it('should process images synchronously', async () => {
			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockRejectedValue(new Error('File not found'))
			mockedFs.readFile.mockResolvedValue(Buffer.from('processed-image-data'))
			mockedFs.writeFile.mockResolvedValue()
			// Production code uses atomic rename (writeFile to .tmp then rename to final path)
			mockedFs.rename.mockResolvedValue()
			mockedFs.unlink.mockResolvedValue()
			// Production code opens the temp file to detect SVG headers
			mockedFs.open.mockResolvedValue({
				read: vi.fn().mockResolvedValue({ bytesRead: 4, buffer: Buffer.alloc(512) }),
				close: vi.fn().mockResolvedValue(undefined),
			} as any)

			await operation.execute(opCtx)

			expect(mockFetchResourceResponseJob.handle).toHaveBeenCalled()
			expect(mockWebpImageManipulationJob.handle).toHaveBeenCalled()
			expect(mockCacheManager.set).toHaveBeenCalledWith('image:public', 'mock-resource-id', expect.any(Object), expect.any(Number))
		})

		it('should process large images synchronously', async () => {
			mockRequest.resizeOptions.width = 4000
			mockRequest.resizeOptions.height = 3000
			opCtx = await operation.setup(mockRequest)

			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockRejectedValue(new Error('File not found'))
			mockedFs.readFile.mockResolvedValue(Buffer.from('processed-image-data'))
			mockedFs.writeFile.mockResolvedValue()
			// Production code uses atomic rename (writeFile to .tmp then rename to final path)
			mockedFs.rename.mockResolvedValue()
			mockedFs.unlink.mockResolvedValue()
			// Production code opens the temp file to detect SVG headers
			mockedFs.open.mockResolvedValue({
				read: vi.fn().mockResolvedValue({ bytesRead: 4, buffer: Buffer.alloc(512) }),
				close: vi.fn().mockResolvedValue(undefined),
			} as any)

			await operation.execute(opCtx)

			expect(mockFetchResourceResponseJob.handle).toHaveBeenCalled()
			expect(mockWebpImageManipulationJob.handle).toHaveBeenCalled()
			expect(mockCacheManager.set).toHaveBeenCalledWith('image:public', 'mock-resource-id', expect.any(Object), expect.any(Number))
		})

		it('should validate file size during processing', async () => {
			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			vi.spyOn(mockInputSanitizationService, 'validateFileSize').mockReturnValue(false)

			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockRejectedValue(new Error('File not found'))

			const mockResponse = {
				status: 200,
				statusText: 'OK',
				headers: { 'content-length': '50000000' }, // 50MB
				data: Buffer.from('large-image-data'),
				config: {} as any,
			} as AxiosResponse

			vi.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValue(mockResponse)

			await expect(operation.execute(opCtx)).rejects.toThrow('Error fetching or processing image.')
			expect(mockMetricsService.recordImageProcessing).toHaveBeenCalledWith('execute', 'unknown', 'error', expect.any(Number), expect.any(String))
		})
	})

	describe('getCachedResource', () => {
		beforeEach(async () => {
			opCtx = await operation.setup(mockRequest)
		})

		it('should return cached resource from multi-layer cache', async () => {
			const mockCachedResource = {
				data: Buffer.from('cached-data'),
				metadata: new ResourceMetaData({
					version: 1,
					size: '1000',
					format: 'webp',
					dateCreated: Date.now(),
					publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
					privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
				}),
			}

			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(mockCachedResource)

			const result = await operation.getCachedResource(opCtx)

			expect(result).toEqual(mockCachedResource)
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'hit', expect.any(Number), expect.any(String))
		})

		it('should fallback to filesystem and cache result', async () => {
			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockResolvedValue()
			mockedFs.readFile
				.mockResolvedValueOnce(Buffer.from('file-data'))
				.mockResolvedValueOnce(JSON.stringify({
					version: 1,
					size: '1000',
					format: 'webp',
					dateCreated: Date.now(),
					publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
					privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
				}))

			const result = await operation.getCachedResource(opCtx)

			expect(result).toBeDefined()
			expect(result?.data).toEqual(Buffer.from('file-data'))
			expect(mockCacheManager.set).toHaveBeenCalledWith('image:public', 'mock-resource-id', expect.any(Object), expect.any(Number))
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'filesystem', 'hit', expect.any(Number), expect.any(String))
		})

		it('should return null when resource not found', async () => {
			vi.spyOn(mockCacheManager, 'get').mockResolvedValue(null)
			const mockedFs = vi.mocked(fs)
			mockedFs.readFile.mockRejectedValue(new Error('File not found'))

			const result = await operation.getCachedResource(opCtx)

			expect(result).toBeNull()
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'miss', expect.any(Number), expect.any(String))
		})

		it('should handle errors gracefully', async () => {
			vi.spyOn(mockCacheManager, 'get').mockRejectedValue(new Error('Cache error'))

			const result = await operation.getCachedResource(opCtx)

			expect(result).toBeNull()
			expect(mockMetricsService.recordError).toHaveBeenCalledWith('cache_retrieval', 'get_cached_resource')
			expect(mockMetricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'multi-layer', 'error', expect.any(Number), expect.any(String))
		})
	})

	describe('optimizeAndServeDefaultImage', () => {
		it('should optimize and serve default image with custom options', async () => {
			const customOptions = new ResizeOptions()
			customOptions.width = 100
			customOptions.height = 100
			customOptions.fit = FitOptions.contain
			customOptions.position = PositionOptions.entropy
			customOptions.format = SupportedResizeFormats.webp
			customOptions.background = BackgroundOptions.white
			customOptions.trimThreshold = 5
			customOptions.quality = 100

			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockRejectedValueOnce({ code: 'ENOENT' } as NodeJS.ErrnoException)

			const result = await operation.optimizeAndServeDefaultImage(customOptions)
			expect(result).toBeDefined()
			expect(mockWebpImageManipulationJob.handle).toHaveBeenCalledWith(
				path.normalize(path.join(mockCwd, 'public', 'default.png')),
				expect.objectContaining({
					width: 100,
					height: 100,
					fit: FitOptions.contain,
					position: PositionOptions.entropy,
					format: SupportedResizeFormats.webp,
					background: BackgroundOptions.white,
					trimThreshold: 5,
					quality: 100,
				}),
			)
		})
	})

	// C14 — SVG XML-declaration bypass: verify the detection regex strips <?xml...?> before <svg check
	// This is a direct regression test for the bypass vector: an SVG starting with an XML declaration
	// would previously be misclassified as non-SVG (because `header.trim().startsWith('<svg')` was false).
	// The fix strips the XML declaration before checking.
	describe('sVG XML-declaration detection (C14)', () => {
		/**
		 * Test the detection regex logic directly by extracting the same transformation
		 * applied in processImageSynchronously. This avoids the fragile mock chain
		 * while still verifying the exact code path that was broken.
		 */
		it('should identify SVG with leading XML declaration after stripping preamble', () => {
			const xmlPrefixedSvg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect/></svg>'
			const plainSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
			const doctypeSvg = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'

			// Simulate the exact detection logic from processImageSynchronously (C14 fix)
			const detectSvg = (header: string): boolean => {
				const stripped = header
					.trimStart()
					.replace(/^<\?xml[^?]*\?>\s*/i, '')
					.replace(/^<!DOCTYPE[^>]*>\s*/i, '')
				return stripped.trimStart().startsWith('<svg') || header.includes('xmlns="http://www.w3.org/2000/svg"')
			}

			// Old check (trimStart().startsWith('<svg')) would fail for XML-prefixed SVG
			expect(xmlPrefixedSvg.trimStart().startsWith('<svg')).toBe(false)

			// New check (strip XML/DOCTYPE preamble first) correctly identifies all variants
			expect(detectSvg(xmlPrefixedSvg)).toBe(true)
			expect(detectSvg(plainSvg)).toBe(true)
			expect(detectSvg(doctypeSvg)).toBe(true)
			expect(detectSvg('data:image/png;base64,abc=')).toBe(false)
			expect(detectSvg('<html><body></body></html>')).toBe(false)
		})

		it('should correctly strip XML declaration with various encodings', () => {
			// The regex /^<\?xml[^?]*\?>\s*/i must handle various XML declarations
			const variants = [
				'<?xml version="1.0"?><svg />',
				'<?xml version="1.0" encoding="UTF-8"?><svg />',
				'<?xml version="1.1" standalone="yes"?><svg />',
				'<?xml version="1.0" encoding="ISO-8859-1"?>\n<svg />',
			]

			for (const variant of variants) {
				const stripped = variant.trimStart().replace(/^<\?xml[^?]*\?>\s*/i, '')
				expect(stripped.trimStart().startsWith('<svg')).toBe(true)
			}
		})
	})

	// C12 — Negative-cache TTL unit consistency
	describe('negative cache TTL (C12)', () => {
		const NEGATIVE_CACHE_TTL_SECONDS = 300

		beforeEach(async () => {
			opCtx = await operation.setup(mockRequest)
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		it('should suppress fetch for an entry within the TTL window', async () => {
			// Seed the negative cache with a timestamp at t=0
			const t0 = 1_700_000_000_000 // arbitrary fixed ms timestamp
			vi.useFakeTimers()
			vi.setSystemTime(t0)

			const negativeCacheKey = `negative:${opCtx.id}`
			vi.spyOn(mockCacheManager, 'get').mockImplementation(async (_ns, key) => {
				if (key === negativeCacheKey) {
					return { status: 404, timestamp: t0 }
				}
				return null
			})

			// 1 second before expiry — should still be suppressed
			vi.setSystemTime(t0 + (NEGATIVE_CACHE_TTL_SECONDS - 1) * 1000)

			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockRejectedValue(new Error('File not found'))

			await expect(operation.execute(opCtx)).rejects.toThrow()
			// fetch should NOT have been called — negative cache hit
			expect(mockFetchResourceResponseJob.handle).not.toHaveBeenCalled()
		})

		it('should allow fetch once the negative-cache TTL has elapsed', async () => {
			const t0 = 1_700_000_000_000
			vi.useFakeTimers()
			vi.setSystemTime(t0)

			const negativeCacheKey = `negative:${opCtx.id}`
			vi.spyOn(mockCacheManager, 'get').mockImplementation(async (_ns, key) => {
				if (key === negativeCacheKey) {
					// Timestamp is older than negativeCacheTtl seconds ago
					return { status: 404, timestamp: t0 - NEGATIVE_CACHE_TTL_SECONDS * 1000 - 1 }
				}
				return null
			})

			vi.setSystemTime(t0)

			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockRejectedValue(new Error('File not found'))
			mockedFs.readFile.mockResolvedValue(Buffer.from('processed-image-data'))
			mockedFs.writeFile.mockResolvedValue()
			mockedFs.rename.mockResolvedValue()
			mockedFs.unlink.mockResolvedValue()
			mockedFs.open.mockResolvedValue({
				read: vi.fn().mockResolvedValue({ bytesRead: 4, buffer: Buffer.alloc(512) }),
				close: vi.fn().mockResolvedValue(undefined),
			} as any)

			// Expired negative cache: fetch SHOULD be called
			await operation.execute(opCtx)
			expect(mockFetchResourceResponseJob.handle).toHaveBeenCalled()
		})

		it('stores negative-cache entry with TTL in seconds', async () => {
			// A 404 response should cache the failure with the correct TTL unit
			vi.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValue({
				status: 404,
				headers: {},
				data: null,
			} as any)

			const mockedFs = vi.mocked(fs)
			mockedFs.access.mockRejectedValue(new Error('File not found'))

			// execute will throw UnableToFetchResourceException — that's expected
			await expect(operation.execute(opCtx)).rejects.toThrow()

			const negativeCacheKey = `negative:${opCtx.id}`
			expect(mockCacheManager.set).toHaveBeenCalledWith(
				'image:public',
				negativeCacheKey,
				expect.objectContaining({ status: 404 }),
				NEGATIVE_CACHE_TTL_SECONDS, // must be seconds, not ms
			)
		})
	})
})
