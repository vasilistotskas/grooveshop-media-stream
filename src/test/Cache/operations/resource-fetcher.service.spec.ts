import type { MockedObject } from 'vitest'
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
import { UpstreamResourceTooLargeError } from '#microservice/common/errors/media-stream.errors'
import { ConfigService } from '#microservice/Config/config.service'
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
		validation = { validateFileSize: vi.fn().mockReturnValue(true) } as any

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
		it('pipes the upstream body into a write stream on the temp path', async () => {
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([Buffer.from('abc'), Buffer.from('def')]), { 'content-length': '6' }))

			await fetcher.fetchToTempFile(requestFor('acme'), 'id', '/tmp/id.rst')

			expect(mockCreateWriteStream).toHaveBeenCalledWith('/tmp/id.rst')
			expect(Buffer.concat(sink.chunks).toString()).toBe('abcdef')
			expect(validation.validateFileSize).toHaveBeenCalledWith(6, 'jpg')
			expect(mockUnlink).not.toHaveBeenCalled()
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
			upstream.write(Buffer.from('partial'))
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
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([Buffer.from('abc')])))

			await expect(fetcher.fetchToTempFile(requestFor('acme'), 'id', '/tmp/id.rst')).rejects.toBeInstanceOf(UnableToStoreFetchedResourceException)
			expect(mockUnlink).toHaveBeenCalledWith('/tmp/id.rst')
		})
	})

	describe('size limits', () => {
		it('rejects a declared Content-Length over the per-format limit without reading the body', async () => {
			validation.validateFileSize.mockReturnValue(false)
			fetchJob.handle.mockResolvedValue(okResponse(new PassThrough(), { 'content-length': String(50 * 1024 * 1024) }))

			await expect(fetcher.fetchToTempFile(requestFor('acme'), 'id', '/tmp/id.rst')).rejects.toBeInstanceOf(UpstreamResourceTooLargeError)
			expect(validation.validateFileSize).toHaveBeenCalledWith(50 * 1024 * 1024, 'jpg')
			expect(mockCreateWriteStream).not.toHaveBeenCalled()
		})

		it('resolves the format from the URL path, ignoring query and fragment', async () => {
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([Buffer.from('x')]), { 'content-length': '1' }))

			await fetcher.fetchToTempFile(requestFor('acme', 'https://example.com/a/b.PNG?w=800#frag'), 'id', '/tmp/id.rst')

			expect(validation.validateFileSize).toHaveBeenCalledWith(1, 'png')
		})

		// Servers that lie about (or omit) Content-Length: the guard trips mid-stream.
		// pipeline() destroys every stream, so the upstream socket is not left dangling.
		it('aborts the stream over the limit: typed error, upstream destroyed, temp file removed', async () => {
			const upstream = new PassThrough()
			fetchJob.handle.mockResolvedValue(okResponse(upstream))

			const fetching = fetcher.fetchToTempFile(requestFor('acme', 'https://example.com/huge.svg'), 'huge-id', '/tmp/huge.rst')
			// SVG's format limit is 1MB (MAX_FILE_SIZES.svg) — exceed it in one chunk
			upstream.write(Buffer.alloc(1024 * 1024 + 1))

			await expect(fetching).rejects.toBeInstanceOf(UpstreamResourceTooLargeError)
			await expect(fetching).rejects.toThrow(/svg limit/)
			expect(upstream.destroyed).toBe(true)
			expect(sink.destroyed).toBe(true)
			expect(mockUnlink).toHaveBeenCalledWith('/tmp/huge.rst')
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
			fetchJob.handle.mockResolvedValue(okResponse(Readable.from([Buffer.from('x')])))

			await fetcher.fetchToTempFile(requestFor('acme'), 'shared-id', '/tmp/id.rst')

			expect(fetchJob.handle).toHaveBeenCalledTimes(1)
		})

		it('does not let one tenant\'s negative entry suppress another tenant\'s fetch for the same resource id', async () => {
			fetchJob.handle.mockResolvedValueOnce({ status: 404, headers: {}, data: null } as any)
			await expect(fetcher.fetchToTempFile(requestFor('acme'), 'shared-id', '/tmp/id.rst')).rejects.toThrow()

			fetchJob.handle.mockResolvedValueOnce(okResponse(Readable.from([Buffer.from('x')])))
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
