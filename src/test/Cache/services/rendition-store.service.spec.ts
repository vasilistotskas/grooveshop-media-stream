import type { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BREAKER_FAILURE_THRESHOLD, BREAKER_OPEN_MS, RenditionStoreService } from '#microservice/Cache/services/rendition-store.service'
import { encodeImageEnvelope } from '#microservice/Cache/utils/image-envelope.util'
import { RenditionStoreUnavailableError } from '#microservice/common/errors/media-stream.errors'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

const sent = vi.hoisted(() => ({
	send: vi.fn(),
	destroy: vi.fn(),
	instances: [] as unknown[],
}))

vi.mock('@aws-sdk/client-s3', () => {
	class Command {
		constructor(public readonly input: Record<string, unknown>) {}
	}
	return {
		S3Client: class {
			constructor(public readonly config: unknown) {
				sent.instances.push(this)
			}

			send = sent.send
			destroy = sent.destroy
		},
		GetObjectCommand: class GetObjectCommand extends Command {},
		PutObjectCommand: class PutObjectCommand extends Command {},
		HeadObjectCommand: class HeadObjectCommand extends Command {},
		DeleteObjectCommand: class DeleteObjectCommand extends Command {},
		DeleteObjectsCommand: class DeleteObjectsCommand extends Command {},
		ListObjectsV2Command: class ListObjectsV2Command extends Command {},
	}
})

const STORE_CONFIG = {
	'renditions.store.endpoint': 'https://acct.eu.r2.cloudflarestorage.com',
	'renditions.store.bucket': 'grooveshop-renditions',
	'renditions.store.accessKeyId': 'key-id',
	'renditions.store.secretAccessKey': 'secret',
	'renditions.store.readTimeoutMs': 150,
	'renditions.store.writeTimeoutMs': 400,
}

function notFound(): Error {
	return Object.assign(new Error('NoSuchKey'), {
		name: 'NoSuchKey',
		$metadata: { httpStatusCode: 404 },
	})
}

function image(): { data: Buffer, metadata: ResourceMetaData } {
	return {
		data: Buffer.from('image-bytes'),
		metadata: new ResourceMetaData({
			size: '11',
			format: 'avif',
			dateCreated: 1_800_000_000_000,
			privateTTL: 1000,
			publicTTL: 2000,
			tenantSchema: 'acme',
		}),
	}
}

function body(bytes: Buffer): { transformToByteArray: () => Promise<Uint8Array> } {
	return {
		transformToByteArray: async () => new Uint8Array(bytes),
	}
}

describe('renditionStoreService', () => {
	let metrics: { recordRenditionStoreOperation: ReturnType<typeof vi.fn> }

	function build(overrides: Record<string, unknown> = {}): RenditionStoreService {
		return new RenditionStoreService(createConfigServiceMock({
			...STORE_CONFIG,
			...overrides,
		}), metrics as unknown as MetricsService)
	}

	beforeEach(() => {
		vi.clearAllMocks()
		sent.instances.length = 0
		metrics = {
			recordRenditionStoreOperation: vi.fn(),
		}
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe('configuration', () => {
		it('is off without an endpoint or a bucket, and then makes no client', async () => {
			for (const overrides of [
				{ 'renditions.store.endpoint': '' },
				{ 'renditions.store.bucket': '' },
			]) {
				const store = build(overrides)
				expect(store.enabled).toBe(false)
				await expect(store.get('acme', 'id')).resolves.toBeNull()
			}
			expect(sent.instances).toHaveLength(0)
			expect(sent.send).not.toHaveBeenCalled()
		})

		it('talks to the configured endpoint with path-style addressing, the auto region, and no retries', () => {
			build()

			expect(sent.instances[0]).toMatchObject({
				config: {
					endpoint: 'https://acct.eu.r2.cloudflarestorage.com',
					region: 'auto',
					forcePathStyle: true,
					maxAttempts: 1,
					requestChecksumCalculation: 'WHEN_REQUIRED',
					responseChecksumValidation: 'WHEN_REQUIRED',
					credentials: { accessKeyId: 'key-id', secretAccessKey: 'secret' },
				},
			})
		})

		it('fails a write, a check and a delete at once while it is off, and sweeps nothing', async () => {
			const store = build({ 'renditions.store.endpoint': '' })

			await expect(store.put('acme', 'id', image())).rejects.toBeInstanceOf(RenditionStoreUnavailableError)
			await expect(store.has('acme', 'id')).rejects.toBeInstanceOf(RenditionStoreUnavailableError)
			await expect(store.delete('acme', 'id')).rejects.toBeInstanceOf(RenditionStoreUnavailableError)
			await expect(store.deleteTenant('acme')).resolves.toEqual({ removed: 0, complete: true, errors: [] })
		})
	})

	describe('get', () => {
		it('returns the rendition of `{tenant}/{id}` with its metadata and bytes', async () => {
			const { data, metadata } = image()
			sent.send.mockResolvedValue({
				Body: body(encodeImageEnvelope({ metadata }, data)),
			})

			const result = await build().get('acme', 'abc')

			expect(sent.send.mock.calls[0][0].input).toEqual({ Bucket: 'grooveshop-renditions', Key: 'acme/abc' })
			expect(result?.data.equals(data)).toBe(true)
			expect(result?.metadata).toMatchObject({ format: 'avif', tenantSchema: 'acme', dateCreated: 1_800_000_000_000 })
			expect(metrics.recordRenditionStoreOperation).toHaveBeenCalledWith('get', 'hit')
		})

		it('is a miss for an object that is not there, which is not a failure', async () => {
			sent.send.mockRejectedValue(notFound())
			const store = build()

			for (let call = 0; call < BREAKER_FAILURE_THRESHOLD + 1; call++) {
				await expect(store.get('acme', 'abc')).resolves.toBeNull()
			}

			expect(sent.send).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD + 1)
			expect(metrics.recordRenditionStoreOperation).toHaveBeenCalledWith('get', 'miss')
			expect(metrics.recordRenditionStoreOperation).not.toHaveBeenCalledWith('get', 'error')
		})

		it('is a miss for a failing store', async () => {
			sent.send.mockRejectedValue(new Error('socket hang up'))

			await expect(build().get('acme', 'abc')).resolves.toBeNull()

			expect(metrics.recordRenditionStoreOperation).toHaveBeenCalledWith('get', 'error')
		})

		it('is a miss, within the read timeout, for a store that never answers', async () => {
			sent.send.mockImplementation(() => new Promise(() => {}))
			const started = Date.now()

			await expect(build().get('acme', 'abc')).resolves.toBeNull()

			expect(Date.now() - started).toBeLessThan(1000)
			expect(metrics.recordRenditionStoreOperation).toHaveBeenCalledWith('get', 'error')
		})

		it('passes an abort signal that fires at the read timeout, so the request itself is cancelled', async () => {
			sent.send.mockImplementation((_command: unknown, options: { abortSignal: AbortSignal }) => new Promise((_resolve, reject) => {
				options.abortSignal.addEventListener('abort', () => reject(new Error('aborted')))
			}))

			await expect(build().get('acme', 'abc')).resolves.toBeNull()

			expect(sent.send.mock.calls[0][1].abortSignal.aborted).toBe(true)
		})

		it('is a miss for an object that is not an image envelope', async () => {
			sent.send.mockResolvedValue({
				Body: body(Buffer.from('<html>not an image</html>')),
			})

			await expect(build().get('acme', 'abc')).resolves.toBeNull()
		})
	})

	describe('breaker', () => {
		it('stops calling the store after a run of failures, and tries again once it has been open long enough', async () => {
			vi.useFakeTimers({
				toFake: ['Date'],
			})
			sent.send.mockRejectedValue(new Error('boom'))
			const store = build()
			for (let call = 0; call < BREAKER_FAILURE_THRESHOLD; call++) {
				await store.get('acme', 'abc')
			}
			expect(sent.send).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD)

			await expect(store.get('acme', 'abc')).resolves.toBeNull()
			await expect(store.put('acme', 'abc', image())).rejects.toBeInstanceOf(RenditionStoreUnavailableError)
			expect(sent.send).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD)
			expect(metrics.recordRenditionStoreOperation).toHaveBeenCalledWith('get', 'skipped')

			vi.advanceTimersByTime(BREAKER_OPEN_MS + 1)
			sent.send.mockResolvedValue({
				Body: body(encodeImageEnvelope({ metadata: image().metadata }, image().data)),
			})
			await expect(store.get('acme', 'abc')).resolves.not.toBeNull()
			await store.get('acme', 'abc')
			expect(sent.send).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD + 2)
		})

		it('opens again at once when the first call after the pause fails', async () => {
			vi.useFakeTimers({
				toFake: ['Date'],
			})
			sent.send.mockRejectedValue(new Error('boom'))
			const store = build()
			for (let call = 0; call < BREAKER_FAILURE_THRESHOLD; call++) {
				await store.get('acme', 'abc')
			}
			vi.advanceTimersByTime(BREAKER_OPEN_MS + 1)

			await store.get('acme', 'abc')
			await store.get('acme', 'abc')

			expect(sent.send).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD + 1)
		})

		it('is closed by one success, so scattered failures never open it', async () => {
			const store = build()
			for (let round = 0; round < 3; round++) {
				sent.send.mockRejectedValue(new Error('boom'))
				for (let call = 0; call < BREAKER_FAILURE_THRESHOLD - 1; call++) {
					await store.get('acme', 'abc')
				}
				sent.send.mockResolvedValue({
					Body: body(encodeImageEnvelope({ metadata: image().metadata }, image().data)),
				})
				await store.get('acme', 'abc')
			}

			expect(metrics.recordRenditionStoreOperation).not.toHaveBeenCalledWith('get', 'skipped')
		})
	})

	describe('put', () => {
		it('writes the envelope under `{tenant}/{id}`', async () => {
			sent.send.mockResolvedValue({})
			const { data, metadata } = image()

			await build().put('acme', 'abc', { data, metadata })

			const input = sent.send.mock.calls[0][0].input
			expect(input).toMatchObject({ Bucket: 'grooveshop-renditions', Key: 'acme/abc' })
			expect(Buffer.from(input.Body).equals(encodeImageEnvelope({ metadata }, data))).toBe(true)
			expect(metrics.recordRenditionStoreOperation).toHaveBeenCalledWith('put', 'ok')
		})

		it('fails, as a store error, when the store fails or is too slow', async () => {
			sent.send.mockRejectedValueOnce(new Error('AccessDenied'))
			await expect(build().put('acme', 'abc', image())).rejects.toBeInstanceOf(RenditionStoreUnavailableError)

			sent.send.mockImplementation(() => new Promise(() => {}))
			await expect(build().put('acme', 'abc', image())).rejects.toThrow(/did not answer within 400 ms/)
		})
	})

	describe('has', () => {
		it('says whether the object is stored', async () => {
			sent.send.mockResolvedValueOnce({})
			sent.send.mockRejectedValueOnce(Object.assign(new Error('NotFound'), {
				name: 'NotFound',
				$metadata: { httpStatusCode: 404 },
			}))
			const store = build()

			await expect(store.has('acme', 'abc')).resolves.toBe(true)
			await expect(store.has('acme', 'abc')).resolves.toBe(false)
		})

		it('throws rather than answer false when the store cannot say', async () => {
			sent.send.mockRejectedValue(new Error('socket hang up'))

			await expect(build().has('acme', 'abc')).rejects.toBeInstanceOf(RenditionStoreUnavailableError)
		})
	})

	describe('delete', () => {
		it('removes one object', async () => {
			sent.send.mockResolvedValue({})

			await build().delete('acme', 'abc')

			expect(sent.send.mock.calls[0][0].input).toEqual({ Bucket: 'grooveshop-renditions', Key: 'acme/abc' })
		})
	})

	describe('deleteTenant', () => {
		it('lists the tenant prefix page by page and deletes each page in one request', async () => {
			sent.send
				.mockResolvedValueOnce({
					Contents: [
						{ Key: 'acme/a' },
						{ Key: 'acme/b' },
					],
					IsTruncated: true,
					NextContinuationToken: 'next',
				})
				.mockResolvedValueOnce({})
				.mockResolvedValueOnce({
					Contents: [
						{ Key: 'acme/c' },
					],
					IsTruncated: false,
				})
				.mockResolvedValueOnce({})

			const sweep = await build().deleteTenant('acme')

			expect(sweep).toEqual({ removed: 3, complete: true, errors: [] })
			expect(sent.send.mock.calls[0][0].input).toMatchObject({ Prefix: 'acme/', ContinuationToken: undefined })
			expect(sent.send.mock.calls[1][0].input).toMatchObject({
				Delete: {
					Objects: [
						{ Key: 'acme/a' },
						{ Key: 'acme/b' },
					],
					Quiet: true,
				},
			})
			expect(sent.send.mock.calls[2][0].input).toMatchObject({ Prefix: 'acme/', ContinuationToken: 'next' })
		})

		it('lists only the tenant\'s own prefix, so a tenant whose name starts with another\'s is left alone', async () => {
			sent.send.mockResolvedValue({ Contents: [] })

			await build().deleteTenant('acme')

			expect(sent.send.mock.calls[0][0].input.Prefix).toBe('acme/')
		})

		it('reports what the store would not delete, as incomplete', async () => {
			sent.send
				.mockResolvedValueOnce({
					Contents: [
						{ Key: 'acme/a' },
						{ Key: 'acme/b' },
					],
				})
				.mockResolvedValueOnce({
					Errors: [
						{ Key: 'acme/b', Code: 'AccessDenied', Message: 'denied' },
					],
				})

			const sweep = await build().deleteTenant('acme')

			expect(sweep).toEqual({
				removed: 1,
				complete: false,
				errors: ['acme/b: denied'],
			})
		})

		it('reports a listing that failed, as incomplete', async () => {
			sent.send.mockRejectedValue(new Error('socket hang up'))

			const sweep = await build().deleteTenant('acme')

			expect(sweep.complete).toBe(false)
			expect(sweep.errors[0]).toContain('socket hang up')
		})

		it('is attempted even while the breaker is open: a flush is an explicit instruction', async () => {
			sent.send.mockRejectedValue(new Error('boom'))
			const store = build()
			for (let call = 0; call < BREAKER_FAILURE_THRESHOLD; call++) {
				await store.get('acme', 'abc')
			}
			sent.send.mockClear()
			sent.send.mockResolvedValue({ Contents: [] })

			const sweep = await store.deleteTenant('acme')

			expect(sent.send).toHaveBeenCalledTimes(1)
			expect(sweep.complete).toBe(true)
		})
	})

	it('closes the client on shutdown', () => {
		build().onModuleDestroy()

		expect(sent.destroy).toHaveBeenCalledOnce()
	})
})
