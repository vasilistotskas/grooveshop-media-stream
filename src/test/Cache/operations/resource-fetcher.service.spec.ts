import type { MockedObject } from 'vitest'
import type { ImageRequestLog } from '#microservice/Correlation/utils/image-request-log.util'
import { Buffer } from 'node:buffer'
import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { PassThrough, Readable, Writable } from 'node:stream'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CacheImageRequest, { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import UnableToFetchResourceException from '#microservice/API/exceptions/unable-to-fetch-resource.exception'
import UnableToStoreFetchedResourceException from '#microservice/API/exceptions/unable-to-store-fetched-resource.exception'
import { ResourceFetcher } from '#microservice/Cache/operations/resource-fetcher.service'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { MAX_FILE_SIZES } from '#microservice/common/constants/image-limits.constant'
import { UnsupportedSourceFormatError, UpstreamResourceTooLargeError } from '#microservice/common/errors/media-stream.errors'
import { ConfigService } from '#microservice/Config/config.service'
import { requestContextStorage } from '#microservice/Correlation/async-local-storage'
import FetchResourceResponseJob from '#microservice/Processing/jobs/fetch-resource-response.job'
import { ResourceValidationService } from '#microservice/Validation/services/resource-validation.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

vi.mock('node:fs', async importOriginal => ({
	...(await importOriginal<typeof import('node:fs')>()),
	createWriteStream: vi.fn(),
}))
vi.mock('node:fs/promises')

const mockCreateWriteStream = vi.mocked(createWriteStream)
const mockUnlink = vi.mocked(unlink)

/** In-memory sink standing in for the `.rst` temp file. */
function memorySink(): Writable & { chunks: Buffer[] } {
	const chunks: Buffer[] = []
	const sink = new Writable({
		write(chunk: Buffer, _encoding, callback) {
			chunks.push(chunk)
			callback()
		},
	})
	return Object.assign(sink, { chunks })
}

function requestFor(tenantSchema: string, resourceTarget = 'https://example.com/image.jpg'): CacheImageRequest {
	return new CacheImageRequest({ resourceTarget, resizeOptions: new ResizeOptions(), tenantSchema })
}

function okResponse(data: unknown, headers: Record<string, string> = {}): any {
	return { status: 200, statusText: 'OK', headers, data, config: {} }
}

const MB = 1024 * 1024
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

/** A body that sniffs as PNG, `size` bytes long. */
function pngBytes(size: number): Buffer {
	return Buffer.concat([PNG_SIGNATURE, Buffer.alloc(size - PNG_SIGNATURE.length, 0x42)])
}

/** An SVG document, padded with a comment to `size` bytes. */
function svgBytes(size: number): Buffer {
	const open = '<svg xmlns="http://www.w3.org/2000/svg"><!--'
	const close = '--></svg>'
	return Buffer.from(open + 'x'.repeat(size - open.length - close.length) + close)
}

function logRecord(): ImageRequestLog {
	return { correlationId: 'c', startedAt: 0n, path: 'p', admissionWaitMs: 0 }
}

function withLog<T>(log: ImageRequestLog, fn: () => Promise<T>): Promise<T> {
	return requestContextStorage.run({ correlationId: 'c', timestamp: 0, clientIp: '127.0.0.1', method: 'GET', url: '/', startTime: 0n, imageRequest: log }, fn)
}

describe('resourceFetcher', () => {
	let fetcher: ResourceFetcher
	let fetchJob: MockedObject<FetchResourceResponseJob>
	let cacheManager: MockedObject<MultiLayerCacheManager>
	let validation: MockedObject<ResourceValidationService>
	let cacheStore: Map<string, unknown>
	let sink: Writable & { chunks: Buffer[] }

	beforeEach(async () => {
		vi.resetAllMocks()
		cacheStore = new Map()
		sink = memorySink()
		mockCreateWriteStream.mockReturnValue(sink as any)
		mockUnlink.mockResolvedValue(undefined)

		fetchJob = { handle: vi.fn() } as any
		cacheManager = {
			get: vi.fn(async (namespace: string, key: string) => cacheStore.get(`${namespace}:${key}`) ?? null),
			set: vi.fn(async (namespace: string, key: string, value: unknown) => {
				cacheStore.set(`${namespace}:${key}`, value)
			}),
			delete: vi.fn(),
		} as any
		// The real rule, so the limits under test are MAX_FILE_SIZES themselves.
		validation = { validateFileSize: vi.fn((bytes: number, format: keyof typeof MAX_FILE_SIZES) => bytes > 0 && bytes <= MAX_FILE_SIZES[format]) } as any

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ResourceFetcher,
				{ provide: FetchResourceResponseJob, useValue: fetchJob },
				{ provide: MultiLayerCacheManager, useValue: cacheManager },
				{ provide: ResourceValidationService, useValue: validation },
				{ provide: ConfigService, useValue: createConfigServiceMock() },
			],
		}).compile()

		fetcher = await module.resolve(ResourceFetcher)
	})

	describe('storing the body', () => {
		it('pipes the upstream body into a write stream on the temp path and reports the sniffed format and size', async () => {
			const body = pngBytes(2048)
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([body.subarray(0, 100), body.subarray(100)]), { 'content-length': String(body.length) }))

			await expect(fetcher.fetchToTempFile(requestFor('acme'), 'id', '/tmp/id.rst')).resolves.toEqual({ format: 'png', bytes: body.length })

			expect(mockCreateWriteStream).toHaveBeenCalledWith('/tmp/id.rst')
			expect(Buffer.concat(sink.chunks).equals(body)).toBe(true)
			expect(validation.validateFileSize).toHaveBeenCalledWith(body.length, 'png')
			expect(mockUnlink).not.toHaveBeenCalled()
		})

		it('passes a body shorter than the sniff window through once it ends', async () => {
			const body = pngBytes(64)
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([body])))

			await expect(fetcher.fetchToTempFile(requestFor('acme'), 'id', '/tmp/id.rst')).resolves.toEqual({ format: 'png', bytes: 64 })
			expect(Buffer.concat(sink.chunks).equals(body)).toBe(true)
		})

		it('rejects a response without a streamable body before opening the temp file', async () => {
			fetchJob.handle.mockResolvedValue(okResponse(null))

			await expect(fetcher.fetchToTempFile(requestFor('acme'), 'id', '/tmp/id.rst')).rejects.toBeInstanceOf(UnableToStoreFetchedResourceException)
			expect(mockCreateWriteStream).not.toHaveBeenCalled()
		})

		it('removes the partial temp file and throws UnableToStoreFetchedResourceException when the upstream stream errors', async () => {
			const upstream = new PassThrough()
			fetchJob.handle.mockResolvedValue(okResponse(upstream))

			const fetching = fetcher.fetchToTempFile(requestFor('acme'), 'id', '/tmp/id.rst')
			upstream.write(pngBytes(2048))
			upstream.destroy(new Error('socket hang up'))

			await expect(fetching).rejects.toBeInstanceOf(UnableToStoreFetchedResourceException)
			expect(mockUnlink).toHaveBeenCalledWith('/tmp/id.rst')
		})

		it('removes the partial temp file when the write stream itself fails', async () => {
			mockCreateWriteStream.mockReturnValue(new Writable({
				write(_chunk, _encoding, callback) {
					callback(Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }))
				},
			}) as any)
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([pngBytes(64)])))

			await expect(fetcher.fetchToTempFile(requestFor('acme'), 'id', '/tmp/id.rst')).rejects.toBeInstanceOf(UnableToStoreFetchedResourceException)
			expect(mockUnlink).toHaveBeenCalledWith('/tmp/id.rst')
		})
	})

	describe('format', () => {
		it.each([
			['a gzip stream (e.g. .svgz, which librsvg would rasterise unsanitised)', Buffer.from([0x1F, 0x8B, 0x08, 0x00, 0x00])],
			['a libvips native .v file', Buffer.from([0x08, 0xF2, 0xA6, 0xB6, 0x00])],
			['text that is not SVG', Buffer.from('<html><body>not an image</body></html>')],
			['an empty body', Buffer.alloc(0)],
		])('refuses %s before anything reaches the temp file', async (_label, body) => {
			const upstream = Readable.from(body.length > 0 ? [body] : [])
			fetchJob.handle.mockResolvedValue(okResponse(upstream))

			await expect(fetcher.fetchToTempFile(requestFor('acme'), 'id', '/tmp/id.rst')).rejects.toBeInstanceOf(UnsupportedSourceFormatError)
			expect(sink.chunks).toHaveLength(0)
			expect(mockUnlink).toHaveBeenCalledWith('/tmp/id.rst')
		})
	})

	describe('size limits follow the sniffed format, not the URL extension', () => {
		it('gives an SVG saved as .png the SVG limit on its declared Content-Length, after reading only the sniff window', async () => {
			const upstream = new PassThrough()
			fetchJob.handle.mockResolvedValue(okResponse(upstream, { 'content-length': String(2 * MB) }))

			const fetching = fetcher.fetchToTempFile(requestFor('acme', 'https://example.com/disguised.png'), 'id', '/tmp/id.rst')
			upstream.write(svgBytes(2 * MB).subarray(0, 4096))

			await expect(fetching).rejects.toBeInstanceOf(UpstreamResourceTooLargeError)
			await expect(fetching).rejects.toThrow(/svg limit/)
			expect(validation.validateFileSize).toHaveBeenCalledWith(2 * MB, 'svg')
			expect(sink.chunks).toHaveLength(0)
			expect(upstream.destroyed).toBe(true)
			expect(mockUnlink).toHaveBeenCalledWith('/tmp/id.rst')
		})

		// Servers that lie about (or omit) Content-Length: the guard trips mid-stream.
		// pipeline() destroys every stream, so the upstream socket is not left dangling.
		it('gives an SVG saved as .png without Content-Length the SVG limit while streaming', async () => {
			const upstream = new PassThrough()
			fetchJob.handle.mockResolvedValue(okResponse(upstream))

			const fetching = fetcher.fetchToTempFile(requestFor('acme', 'https://example.com/disguised.png'), 'huge-id', '/tmp/huge.rst')
			upstream.write(svgBytes(MB + 1))

			await expect(fetching).rejects.toBeInstanceOf(UpstreamResourceTooLargeError)
			await expect(fetching).rejects.toThrow(/svg limit after 1048577 bytes/)
			expect(upstream.destroyed).toBe(true)
			expect(sink.destroyed).toBe(true)
			expect(mockUnlink).toHaveBeenCalledWith('/tmp/huge.rst')
		})

		it('gives a PNG saved as .svg the PNG limit', async () => {
			const body = pngBytes(2 * MB)
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([body]), { 'content-length': String(body.length) }))

			await expect(fetcher.fetchToTempFile(requestFor('acme', 'https://example.com/disguised.svg'), 'id', '/tmp/id.rst')).resolves.toEqual({ format: 'png', bytes: 2 * MB })
			expect(validation.validateFileSize).toHaveBeenCalledWith(2 * MB, 'png')
		})

		it('accepts a real PNG under its limit and rejects one over it', async () => {
			mockCreateWriteStream.mockImplementation(() => memorySink() as any)
			fetchJob.handle.mockResolvedValueOnce(okResponse(Readable.from([pngBytes(4096)]), { 'content-length': '4096' }))
			await expect(fetcher.fetchToTempFile(requestFor('acme', 'https://example.com/real.png'), 'id', '/tmp/id.rst')).resolves.toEqual({ format: 'png', bytes: 4096 })

			fetchJob.handle.mockResolvedValueOnce(okResponse(Readable.from([pngBytes(4096)]), { 'content-length': String(MAX_FILE_SIZES.png + 1) }))
			await expect(fetcher.fetchToTempFile(requestFor('acme', 'https://example.com/real.png'), 'id', '/tmp/id.rst')).rejects.toThrow(/png limit/)
		})

		it('treats an unparsable Content-Length as absent', async () => {
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([pngBytes(64)]), { 'content-length': 'lots' }))

			await expect(fetcher.fetchToTempFile(requestFor('acme'), 'id', '/tmp/id.rst')).resolves.toEqual({ format: 'png', bytes: 64 })
		})
	})

	describe('request log', () => {
		it('records the sniffed format and the bytes actually stored', async () => {
			const log = logRecord()
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([pngBytes(4096)]), { 'content-length': '4096' }))

			await withLog(log, () => fetcher.fetchToTempFile(requestFor('acme'), 'id', '/tmp/id.rst'))

			expect(log).toMatchObject({ inputFormat: 'png', inputBytes: 4096 })
		})

		it('records the declared size of a source refused on it', async () => {
			const log = logRecord()
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([svgBytes(2048)]), { 'content-length': String(3 * MB) }))

			await expect(withLog(log, () => fetcher.fetchToTempFile(requestFor('acme', 'https://example.com/x.png'), 'id', '/tmp/id.rst'))).rejects.toBeInstanceOf(UpstreamResourceTooLargeError)

			expect(log).toMatchObject({ inputFormat: 'svg', inputBytes: 3 * MB })
		})

		it('records the streamed count of a source that outgrew its limit', async () => {
			const log = logRecord()
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([svgBytes(MB + 10)])))

			await expect(withLog(log, () => fetcher.fetchToTempFile(requestFor('acme'), 'id', '/tmp/id.rst'))).rejects.toBeInstanceOf(UpstreamResourceTooLargeError)

			expect(log).toMatchObject({ inputFormat: 'svg', inputBytes: MB + 10 })
		})
	})

	describe('negative cache', () => {
		it('records upstream failures under a tenant-namespaced key and rejects', async () => {
			fetchJob.handle.mockResolvedValue({ status: 404, headers: {}, data: null } as any)

			await expect(fetcher.fetchToTempFile(requestFor('acme'), 'shared-id', '/tmp/id.rst')).rejects.toBeInstanceOf(UnableToFetchResourceException)

			expect(cacheManager.set).toHaveBeenCalledWith('image:acme', 'negative:shared-id', expect.objectContaining({ status: 404 }), 300)
			expect(cacheStore.has('image:acme:negative:shared-id')).toBe(true)
			expect(cacheStore.has('image:public:negative:shared-id')).toBe(false)
		})

		it('short-circuits a fetch while the negative entry is fresh', async () => {
			cacheStore.set('image:acme:negative:shared-id', { status: 404, timestamp: Date.now() })

			await expect(fetcher.fetchToTempFile(requestFor('acme'), 'shared-id', '/tmp/id.rst')).rejects.toBeInstanceOf(UnableToFetchResourceException)
			expect(fetchJob.handle).not.toHaveBeenCalled()
		})

		it('retries once the negative entry is older than the TTL', async () => {
			cacheStore.set('image:acme:negative:shared-id', { status: 404, timestamp: Date.now() - 300 * 1000 - 1 })
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([pngBytes(64)])))

			await fetcher.fetchToTempFile(requestFor('acme'), 'shared-id', '/tmp/id.rst')

			expect(fetchJob.handle).toHaveBeenCalledTimes(1)
		})

		it('does not let one tenant\'s negative entry suppress another tenant\'s fetch for the same resource id', async () => {
			fetchJob.handle.mockResolvedValueOnce({ status: 404, headers: {}, data: null } as any)
			await expect(fetcher.fetchToTempFile(requestFor('acme'), 'shared-id', '/tmp/id.rst')).rejects.toThrow()

			fetchJob.handle.mockResolvedValueOnce(okResponse(Readable.from([pngBytes(64)])))
			await fetcher.fetchToTempFile(requestFor('beta'), 'shared-id', '/tmp/id.rst')

			expect(fetchJob.handle).toHaveBeenCalledTimes(2)
		})

		it('falls back to the "public" namespace when the request carries no tenantSchema', async () => {
			fetchJob.handle.mockResolvedValue({ status: 404, headers: {}, data: null } as any)

			await expect(fetcher.fetchToTempFile(requestFor(''), 'anon-id', '/tmp/id.rst')).rejects.toThrow()

			expect(cacheManager.set).toHaveBeenCalledWith('image:public', 'negative:anon-id', expect.objectContaining({ status: 404 }), expect.any(Number))
		})
	})
})
