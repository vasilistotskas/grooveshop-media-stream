import type { OnModuleDestroy } from '@nestjs/common'
import type { RenditionStoreConfig } from '#microservice/Config/interfaces/app-config.interface'
import type { RenditionStoreOperationName, RenditionStoreResultName } from '#microservice/Metrics/services/metrics.service'
import type { ProcessedImage } from '../operations/image-format-processor.service.js'
import { Buffer } from 'node:buffer'
import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Injectable } from '@nestjs/common'
import { RenditionStoreUnavailableError } from '#microservice/common/errors/media-stream.errors'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { decodeImageEnvelope, encodeImageEnvelope } from '../utils/image-envelope.util.js'

/** Cloudflare R2 ignores the region and asks for `auto`; other S3 servers accept any. */
const REGION = 'auto'

/** Consecutive failures that open the breaker, and how long it stays open. */
export const BREAKER_FAILURE_THRESHOLD = 5
export const BREAKER_OPEN_MS = 30_000

/** The S3 API deletes at most this many keys per request. */
const DELETE_BATCH_SIZE = 1000

export interface TenantSweep {
	removed: number
	/** False when an object of the tenant may still be stored: the listing or a delete failed. */
	complete: boolean
	errors: string[]
}

function isNotFound(error: unknown): boolean {
	return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
}

/**
 * The renditions every replica shares: one object per rendition in an
 * S3-compatible bucket (Cloudflare R2), `{tenant}/{id}`, holding the image
 * envelope (metadata JSON + bytes). It sits behind the memory and Redis tiers.
 *
 * It never holds up a request. Every call has a deadline (an abort signal, and
 * a race against it, so a stalled socket cannot outlive it), the SDK does not
 * retry, and after `BREAKER_FAILURE_THRESHOLD` failures in a row it stops
 * calling for `BREAKER_OPEN_MS`. A read that fails is a miss, so the request is
 * processed; a write that fails throws, and the caller serves the image
 * uncached. Socket I/O does not use libuv's thread pool, so a store that hangs
 * cannot starve Sharp the way a stalled network filesystem would.
 */
@Injectable()
export class RenditionStoreService implements OnModuleDestroy {
	private readonly config: RenditionStoreConfig
	private readonly client: S3Client | null
	private consecutiveFailures = 0
	private openUntil = 0

	constructor(configService: ConfigService, private readonly metrics: MetricsService) {
		this.config = configService.get<RenditionStoreConfig>('renditions.store')
		this.client = this.enabled
			? new S3Client({
					endpoint: this.config.endpoint,
					region: REGION,
					forcePathStyle: true,
					maxAttempts: 1,
					// Plain, unchunked requests: only the checksums an operation requires. Other
					// S3-compatible servers, and older R2 deployments, do not all accept the SDK's
					// default trailing checksum on a streamed body.
					requestChecksumCalculation: 'WHEN_REQUIRED',
					responseChecksumValidation: 'WHEN_REQUIRED',
					credentials: {
						accessKeyId: this.config.accessKeyId,
						secretAccessKey: this.config.secretAccessKey,
					},
				})
			: null
	}

	get enabled(): boolean {
		return this.config.endpoint !== '' && this.config.bucket !== ''
	}

	onModuleDestroy(): void {
		this.client?.destroy()
	}

	/** The stored rendition, or null for a miss, a store that is off, down, slow or holding something unreadable. */
	async get(tenantSchema: string, id: string): Promise<ProcessedImage | null> {
		if (!this.client) {
			return null
		}
		try {
			const body = await this.call('get', this.config.readTimeoutMs, async (client, abortSignal) => {
				const response = await client.send(new GetObjectCommand({
					Bucket: this.config.bucket,
					Key: this.keyOf(tenantSchema, id),
				}), { abortSignal })
				return response.Body?.transformToByteArray()
			})
			const envelope = body
				? decodeImageEnvelope(Buffer.from(body.buffer, body.byteOffset, body.byteLength))
				: null
			if (!envelope) {
				this.record('get', 'error')
				CorrelatedLogger.warn(`Rendition ${tenantSchema}/${id} in the store is not an image envelope, treating it as a miss`, RenditionStoreService.name)
				return null
			}
			this.record('get', 'hit')
			return { ...envelope.rest, data: envelope.data } as unknown as ProcessedImage
		}
		catch (error: unknown) {
			if (isNotFound(error)) {
				this.settle(true)
				this.record('get', 'miss')
			}
			return null
		}
	}

	/** @throws RenditionStoreUnavailableError when the store is off, down or too slow */
	async put(tenantSchema: string, id: string, image: ProcessedImage): Promise<void> {
		const { data, ...rest } = image
		await this.call('put', this.config.writeTimeoutMs, (client, abortSignal) => client.send(new PutObjectCommand({
			Bucket: this.config.bucket,
			Key: this.keyOf(tenantSchema, id),
			Body: encodeImageEnvelope(rest, data),
			ContentType: 'application/octet-stream',
		}), { abortSignal }))
	}

	/** @throws RenditionStoreUnavailableError when the store is off, down or too slow: "unknown" is not "absent" */
	async has(tenantSchema: string, id: string): Promise<boolean> {
		try {
			await this.call('head', this.config.readTimeoutMs, (client, abortSignal) => client.send(new HeadObjectCommand({
				Bucket: this.config.bucket,
				Key: this.keyOf(tenantSchema, id),
			}), { abortSignal }))
			return true
		}
		catch (error: unknown) {
			if (isNotFound(error)) {
				this.settle(true)
				return false
			}
			throw error
		}
	}

	/** @throws RenditionStoreUnavailableError when the store is off, down or too slow */
	async delete(tenantSchema: string, id: string): Promise<void> {
		await this.call('delete', this.config.writeTimeoutMs, (client, abortSignal) => client.send(new DeleteObjectCommand({
			Bucket: this.config.bucket,
			Key: this.keyOf(tenantSchema, id),
		}), { abortSignal }))
	}

	/**
	 * Remove every rendition of a tenant. A flush is an explicit instruction, so
	 * it is attempted even while the breaker is open; what it could not remove is
	 * reported, never hidden.
	 */
	async deleteTenant(tenantSchema: string): Promise<TenantSweep> {
		const sweep: TenantSweep = { removed: 0, complete: true, errors: [] }
		if (!this.client) {
			return sweep
		}
		const prefix = `${tenantSchema}/`
		let continuationToken: string | undefined
		try {
			do {
				const page = await this.call('list', this.config.writeTimeoutMs, (client, abortSignal) => client.send(new ListObjectsV2Command({
					Bucket: this.config.bucket,
					Prefix: prefix,
					MaxKeys: DELETE_BATCH_SIZE,
					ContinuationToken: continuationToken,
				}), { abortSignal }), true)
				const keys = (page.Contents ?? []).flatMap(object => object.Key
					? [
							{ Key: object.Key },
						]
					: [])
				if (keys.length > 0) {
					const result = await this.call('delete', this.config.writeTimeoutMs, (client, abortSignal) => client.send(new DeleteObjectsCommand({
						Bucket: this.config.bucket,
						Delete: { Objects: keys, Quiet: true },
					}), { abortSignal }), true)
					const failed = result.Errors ?? []
					sweep.removed += keys.length - failed.length
					for (const failure of failed) {
						sweep.complete = false
						sweep.errors.push(`${failure.Key}: ${failure.Message ?? failure.Code}`)
					}
				}
				continuationToken = page.IsTruncated
					? page.NextContinuationToken
					: undefined
			} while (continuationToken)
		}
		catch (error: unknown) {
			sweep.complete = false
			sweep.errors.push(errorMessage(error))
		}
		return sweep
	}

	private keyOf(tenantSchema: string, id: string): string {
		return `${tenantSchema}/${id}`
	}

	/**
	 * One call under its deadline and the breaker. Anything it throws has been
	 * counted; a 404 is an answer, not a failure, and is left to the caller.
	 */
	private async call<T>(operation: RenditionStoreOperationName, timeoutMs: number, fn: (client: S3Client, signal: AbortSignal) => Promise<T>, ignoreBreaker = false): Promise<T> {
		if (!this.client) {
			throw new RenditionStoreUnavailableError('The rendition store is not configured')
		}
		if (!ignoreBreaker && Date.now() < this.openUntil) {
			this.record(operation, 'skipped')
			throw new RenditionStoreUnavailableError('The rendition store is failing, not calling it for now')
		}

		const signal = AbortSignal.timeout(timeoutMs)
		const deadline = new Promise<never>((_resolve, reject) => {
			signal.addEventListener('abort', () => reject(new RenditionStoreUnavailableError(`The rendition store did not answer within ${timeoutMs} ms`)), { once: true })
		})
		deadline.catch(() => undefined)
		try {
			const result = await Promise.race([
				fn(this.client, signal),
				deadline,
			])
			this.settle(true)
			if (operation !== 'get') {
				this.record(operation, 'ok')
			}
			return result
		}
		catch (error: unknown) {
			if (isNotFound(error)) {
				throw error
			}
			this.settle(false)
			this.record(operation, 'error')
			CorrelatedLogger.warn(`Rendition store ${operation} failed: ${errorMessage(error)}`, RenditionStoreService.name)
			throw error instanceof RenditionStoreUnavailableError
				? error
				: new RenditionStoreUnavailableError(`The rendition store ${operation} failed: ${errorMessage(error)}`)
		}
	}

	/** Count a call's outcome towards the breaker: a success closes it, the threshold-th failure in a row opens it. */
	private settle(succeeded: boolean): void {
		if (succeeded) {
			this.consecutiveFailures = 0
			return
		}
		this.consecutiveFailures++
		if (this.consecutiveFailures >= BREAKER_FAILURE_THRESHOLD) {
			if (Date.now() >= this.openUntil) {
				CorrelatedLogger.warn(`Rendition store failed ${this.consecutiveFailures} times in a row, not calling it for ${BREAKER_OPEN_MS / 1000} s`, RenditionStoreService.name)
			}
			this.openUntil = Date.now() + BREAKER_OPEN_MS
		}
	}

	private record(operation: RenditionStoreOperationName, result: RenditionStoreResultName): void {
		this.metrics.recordRenditionStoreOperation(operation, result)
	}
}
