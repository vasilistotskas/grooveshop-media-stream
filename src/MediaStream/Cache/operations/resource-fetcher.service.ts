import type { TransformCallback } from 'node:stream'
import type CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import type { SourceImageFormat } from '#microservice/common/constants/image-limits.constant'
import type { ResourceIdentifierKP } from '#microservice/common/constants/key-properties.constant'
import type { ImageRequestLog } from '#microservice/Correlation/utils/image-request-log.util'
import { Buffer } from 'node:buffer'
import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Injectable } from '@nestjs/common'
import UnableToFetchResourceException from '#microservice/API/exceptions/unable-to-fetch-resource.exception'
import UnableToStoreFetchedResourceException from '#microservice/API/exceptions/unable-to-store-fetched-resource.exception'
import { MAX_FILE_SIZES } from '#microservice/common/constants/image-limits.constant'
import { UnsupportedSourceFormatError, UpstreamResourceTooLargeError } from '#microservice/common/errors/media-stream.errors'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { currentImageRequest } from '#microservice/Correlation/utils/image-request-log.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import FetchResourceResponseJob from '#microservice/Processing/jobs/fetch-resource-response.job'
import { ResourceValidationService } from '#microservice/Validation/services/resource-validation.service'
import { MultiLayerCacheManager } from '../services/multi-layer-cache.manager.js'
import { imageNamespace } from '../utils/cache-namespace.util.js'
import { FORMAT_SNIFF_BYTES, sniffImageFormat } from '../utils/image-format-sniff.util.js'

/** What landed in the temp file: the format sniffed from its bytes and its size. */
export interface FetchedSource {
	format: SourceImageFormat
	bytes: number
}

/**
 * Pass-through between the upstream body and the temp file. It holds the
 * first FORMAT_SNIFF_BYTES back and sniffs the real format from them; from
 * then on that format's MAX_FILE_SIZES entry is the limit, applied to the
 * declared Content-Length at once and to every byte streamed after. Nothing
 * reaches the file before the format is known, and a refused source costs
 * one kilobyte of download and no decoder.
 */
class SourceGuard extends Transform {
	format: SourceImageFormat | null = null
	bytes = 0
	private readonly head: Buffer[] = []

	constructor(
		private readonly resource: string,
		private readonly declaredBytes: number | null,
		private readonly withinLimit: (bytes: number, format: SourceImageFormat) => boolean,
		private readonly log: ImageRequestLog | undefined,
	) {
		super()
	}

	override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
		this.bytes += chunk.length
		if (this.format === null) {
			this.head.push(chunk)
			if (this.bytes < FORMAT_SNIFF_BYTES) {
				callback()
				return
			}
			this.releaseHead(callback)
			return
		}
		const error = this.overLimit(this.format)
		if (error) {
			callback(error)
			return
		}
		callback(null, chunk)
	}

	override _flush(callback: TransformCallback): void {
		if (this.format === null) {
			this.releaseHead(callback)
			return
		}
		callback()
	}

	/** Sniff the held-back head, check both limits, then pass the head on. */
	private releaseHead(callback: TransformCallback): void {
		const head = Buffer.concat(this.head)
		this.head.length = 0
		const format = sniffImageFormat(head.subarray(0, FORMAT_SNIFF_BYTES))
		if (format === null) {
			callback(new UnsupportedSourceFormatError('Upstream resource is not a supported image format', { resource: this.resource }))
			return
		}
		this.format = format
		if (this.log) {
			this.log.inputFormat = format
		}
		if (this.declaredBytes !== null && !this.withinLimit(this.declaredBytes, format)) {
			callback(new UpstreamResourceTooLargeError(
				`Declared Content-Length ${this.declaredBytes} bytes exceeds the ${format} limit`,
				{ resource: this.resource, declaredBytes: this.declaredBytes, maxBytes: MAX_FILE_SIZES[format], format },
			))
			return
		}
		const error = this.overLimit(format)
		if (error) {
			callback(error)
			return
		}
		callback(null, head)
	}

	private overLimit(format: SourceImageFormat): UpstreamResourceTooLargeError | null {
		if (this.withinLimit(this.bytes, format)) {
			return null
		}
		if (this.log) {
			this.log.inputBytes = this.bytes
		}
		return new UpstreamResourceTooLargeError(
			`Upstream stream exceeded the ${format} limit after ${this.bytes} bytes`,
			{ resource: this.resource, bytesSeen: this.bytes, maxBytes: MAX_FILE_SIZES[format], format },
		)
	}
}

/**
 * Fetches an upstream image resource to a local temp file with negative
 * caching, format sniffing and streaming size enforcement: everything
 * between "should we even try to fetch?" and "the bytes are on disk".
 */
@Injectable()
export class ResourceFetcher {
	private readonly negativeCacheTtl: number

	constructor(
		private readonly fetchResourceResponseJob: FetchResourceResponseJob,
		private readonly cacheManager: MultiLayerCacheManager,
		private readonly resourceValidationService: ResourceValidationService,
		configService: ConfigService,
	) {
		// Negative-cache TTL in seconds. Stored timestamp is Date.now() (ms);
		// comparison uses negativeCacheTtl * 1000 to convert to ms — do NOT pre-multiply here.
		this.negativeCacheTtl = configService.get('cache.image.negativeCacheTtl')
	}

	/**
	 * Fetch the request's resource into `tempPath`.
	 * @throws UnableToFetchResourceException on upstream failure (recorded in the negative cache for the TTL)
	 * @throws UnsupportedSourceFormatError when the bytes are not a format the pipeline accepts
	 * @throws UpstreamResourceTooLargeError when the declared or streamed size exceeds the sniffed format's limit
	 * @throws UnableToStoreFetchedResourceException when the body cannot be written to disk
	 */
	async fetchToTempFile(request: CacheImageRequest, resourceId: ResourceIdentifierKP, tempPath: string): Promise<FetchedSource> {
		// Captured here: stream callbacks need not run in the request's async context.
		const log = currentImageRequest()
		const namespace = imageNamespace(request.tenantSchema)
		const negativeCacheKey = `negative:${resourceId}`
		const negativeCached = await this.cacheManager.get<{ status: number, timestamp: number }>(namespace, negativeCacheKey)
		if (negativeCached && Date.now() - negativeCached.timestamp < this.negativeCacheTtl * 1000) {
			CorrelatedLogger.debug(`Negative cache hit for ${request.resourceTarget}`, ResourceFetcher.name)
			throw new UnableToFetchResourceException(request.resourceTarget)
		}

		const response = await this.fetchResourceResponseJob.handle(request)
		if (!response || response.status >= 400) {
			const status = response?.status || 404
			await this.cacheManager.set(namespace, negativeCacheKey, { status, timestamp: Date.now() }, this.negativeCacheTtl)
			CorrelatedLogger.warn(`Caching negative result for ${request.resourceTarget} (status: ${status})`, ResourceFetcher.name)
			throw new UnableToFetchResourceException(request.resourceTarget)
		}

		if (!response.data || typeof response.data.pipe !== 'function') {
			CorrelatedLogger.error(`Upstream response for ${request.resourceTarget} carries no streamable body`, undefined, ResourceFetcher.name)
			throw new UnableToStoreFetchedResourceException(request.resourceTarget)
		}

		// An unparsable Content-Length is treated as absent; the streamed count still applies.
		const declared = Number.parseInt(String(response.headers['content-length'] ?? ''), 10)
		const declaredBytes = Number.isFinite(declared) ? declared : null
		if (log && declaredBytes !== null) {
			log.inputBytes = declaredBytes
		}

		// Also the byte counter for servers that lie about (or omit)
		// Content-Length. pipeline() destroys every stream — upstream socket
		// included — as soon as any one of them errors, so a tripped guard
		// cannot leak the connection back to the agent pool half-read.
		const guard = new SourceGuard(
			request.resourceTarget,
			declaredBytes,
			(bytes, format) => this.resourceValidationService.validateFileSize(bytes, format),
			log,
		)

		try {
			await pipeline(response.data, guard, createWriteStream(tempPath))
		}
		catch (error: unknown) {
			await unlink(tempPath).catch(() => {})
			if (error instanceof UpstreamResourceTooLargeError || error instanceof UnsupportedSourceFormatError) {
				throw error
			}
			CorrelatedLogger.error(`Failed to store ${request.resourceTarget} to ${tempPath}: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, ResourceFetcher.name)
			throw new UnableToStoreFetchedResourceException(request.resourceTarget)
		}

		// The guard's flush sniffs whatever arrived, so a finished pipeline always has a format.
		const format = guard.format as SourceImageFormat
		if (log) {
			log.inputBytes = guard.bytes
		}
		return { format, bytes: guard.bytes }
	}
}
