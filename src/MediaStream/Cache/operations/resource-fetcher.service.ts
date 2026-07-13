import type CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import type { ResourceIdentifierKP } from '#microservice/common/constants/key-properties.constant'
import { Buffer } from 'node:buffer'
import { Transform } from 'node:stream'
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
		const negativeCacheKey = `negative:${resourceId}`
		const negativeCached = await this.cacheManager.get<{ status: number, timestamp: number }>('image', negativeCacheKey)
		if (negativeCached && Date.now() - negativeCached.timestamp < this.negativeCacheTtl * 1000) {
			CorrelatedLogger.debug(`Negative cache hit for ${request.resourceTarget}`, ResourceFetcher.name)
			throw new UnableToFetchResourceException(request.resourceTarget)
		}

		const response = await this.fetchResourceResponseJob.handle(request)
		if (!response || response.status === 404 || response.status >= 400) {
			// Cache the failure to prevent repeated requests
			await this.cacheManager.set('image', negativeCacheKey, {
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

		// Wrap the axios stream with the guard transform
		const originalStream = response.data
		response.data = originalStream.pipe(sizeGuardTransform)
		// Forward stream errors so StoreResourceResponseToFileJob rejects cleanly
		originalStream.on('error', (err: Error) => sizeGuardTransform.destroy(err))

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
