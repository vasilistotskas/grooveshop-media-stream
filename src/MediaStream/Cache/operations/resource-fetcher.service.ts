import type CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import type { ResourceIdentifierKP } from '#microservice/common/constants/key-properties.constant'
import { Buffer } from 'node:buffer'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Injectable } from '@nestjs/common'
import UnableToFetchResourceException from '#microservice/API/exceptions/unable-to-fetch-resource.exception'
import { MAX_FILE_SIZES } from '#microservice/common/constants/image-limits.constant'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import FetchResourceResponseJob from '#microservice/Processing/jobs/fetch-resource-response.job'
import StoreResourceResponseToFileJob from '#microservice/Processing/jobs/store-resource-response-to-file.job'
import { InputSanitizationService } from '#microservice/Validation/services/input-sanitization.service'
import { MultiLayerCacheManager } from '../services/multi-layer-cache.manager.js'

/**
 * Fetches an upstream image resource to a local temp file with negative
 * caching and streaming size enforcement.
 *
 * Extracted from CacheImageResourceOperation: owns everything between
 * "should we even try to fetch?" and "the bytes are on disk".
 */
@Injectable()
export class ResourceFetcher {
	private readonly negativeCacheTtl: number

	constructor(
		private readonly fetchResourceResponseJob: FetchResourceResponseJob,
		private readonly storeResourceResponseToFileJob: StoreResourceResponseToFileJob,
		private readonly cacheManager: MultiLayerCacheManager,
		private readonly inputSanitizationService: InputSanitizationService,
		private readonly configService: ConfigService,
	) {
		// Negative-cache TTL in seconds. Stored timestamp is Date.now() (ms);
		// comparison uses negativeCacheTtl * 1000 to convert to ms — do NOT pre-multiply here.
		this.negativeCacheTtl = this.configService.getOptional('cache.image.negativeCacheTtl', 300)
	}

	/**
	 * Fetch the request's resource into `tempPath`.
	 * Throws UnableToFetchResourceException on upstream failure (and records
	 * a negative-cache entry so the failure is not retried for the TTL).
	 */
	async fetchToTempFile(request: CacheImageRequest, resourceId: ResourceIdentifierKP, tempPath: string): Promise<void> {
		// Check negative cache first to avoid repeated failed fetches
		const namespace = `image:${request.tenantSchema || 'public'}`
		const negativeCacheKey = `negative:${resourceId}`
		const negativeCached = await this.cacheManager.get<{ status: number, timestamp: number }>(namespace, negativeCacheKey)
		if (negativeCached && Date.now() - negativeCached.timestamp < this.negativeCacheTtl * 1000) {
			CorrelatedLogger.debug(`Negative cache hit for ${request.resourceTarget}`, ResourceFetcher.name)
			throw new UnableToFetchResourceException(request.resourceTarget)
		}

		const response = await this.fetchResourceResponseJob.handle(request)
		if (!response || response.status === 404 || response.status >= 400) {
			// Cache the failure to prevent repeated requests
			await this.cacheManager.set(namespace, negativeCacheKey, {
				status: response?.status || 404,
				timestamp: Date.now(),
			}, this.negativeCacheTtl)
			CorrelatedLogger.warn(`Caching negative result for ${request.resourceTarget} (status: ${response?.status || 404})`, ResourceFetcher.name)
			throw new UnableToFetchResourceException(request.resourceTarget)
		}

		const contentLength = response.headers['content-length']
		const format = this.getFormatFromUrl(request.resourceTarget)
		if (contentLength) {
			const sizeBytes = Number.parseInt(String(contentLength), 10)
			if (!this.inputSanitizationService.validateFileSize(sizeBytes, format)) {
				throw new Error(`File size ${sizeBytes} bytes exceeds limit for format ${format}`)
			}
		}

		// Streaming byte counter: accumulate response body bytes and abort if
		// the format-specific limit is exceeded before the download completes.
		// This catches servers that lie (or omit) Content-Length.
		const maxBytes = (MAX_FILE_SIZES as Record<string, number>)[format] ?? MAX_FILE_SIZES.default
		let bytesSeen = 0
		let limitExceeded = false

		const sizeGuardTransform = new Transform({
			transform(chunk, _encoding, callback) {
				bytesSeen += (chunk as Buffer).length
				if (bytesSeen > maxBytes) {
					limitExceeded = true
					callback(new Error(
						`Streaming size limit exceeded: ${bytesSeen} bytes > ${maxBytes} bytes for format ${format}`,
					))
				}
				else {
					callback(null, chunk)
				}
			},
		})

		// Wrap the axios stream with the guard transform via pipeline() instead
		// of a manual `.pipe()` chain. Node's `readable.pipe(dest)` does NOT
		// destroy the source when the destination errors — when the guard trips
		// (limit exceeded), the raw axios/socket stream was left dangling,
		// leaking the upstream connection back to the HTTP agent pool.
		// pipeline() destroys every stream passed to it, in both directions, as
		// soon as any one of them errors (see
		// https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-options).
		// Its returned promise only resolves once sizeGuardTransform's readable
		// side is fully drained by the downstream reader
		// (StoreResourceResponseToFileJob, below), so we don't await it inline
		// — we just need to observe/absorb its rejection so a guard trip (or an
		// upstream network error) doesn't surface as an unhandled promise
		// rejection. The authoritative error is the one StoreResourceResponseToFileJob
		// observes via response.data's 'error' event and rejects on, which is
		// what the catch block below inspects via `limitExceeded`.
		const originalStream = response.data
		pipeline(originalStream, sizeGuardTransform).catch(() => {})
		response.data = sizeGuardTransform

		try {
			await this.storeResourceResponseToFileJob.handle(request.resourceTarget, tempPath, response)
		}
		catch (err: unknown) {
			if (limitExceeded) {
				throw new Error(
					`File size exceeds limit for format ${format}: stream aborted after ${bytesSeen} bytes`,
				)
			}
			throw err
		}
	}

	private getFormatFromUrl(url: string): string {
		// Strip query/fragment first — image.jpg?w=800 must resolve to 'jpg',
		// not fall through to the (larger) default size limit
		const path = url.split(/[?#]/, 1)[0]
		const extension = path.split('.').pop()?.toLowerCase()
		return extension || 'unknown'
	}
}
