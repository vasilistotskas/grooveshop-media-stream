import type { Buffer } from 'node:buffer'
import type CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import type { ResourceIdentifierKP } from '#microservice/common/constants/key-properties.constant'
import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Injectable } from '@nestjs/common'
import UnableToFetchResourceException from '#microservice/API/exceptions/unable-to-fetch-resource.exception'
import UnableToStoreFetchedResourceException from '#microservice/API/exceptions/unable-to-store-fetched-resource.exception'
import { MAX_FILE_SIZES } from '#microservice/common/constants/image-limits.constant'
import { UpstreamResourceTooLargeError } from '#microservice/common/errors/media-stream.errors'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import FetchResourceResponseJob from '#microservice/Processing/jobs/fetch-resource-response.job'
import { ResourceValidationService } from '#microservice/Validation/services/resource-validation.service'
import { MultiLayerCacheManager } from '../services/multi-layer-cache.manager.js'
import { imageNamespace } from '../utils/cache-namespace.util.js'

/**
 * Fetches an upstream image resource to a local temp file with negative
 * caching and streaming size enforcement: everything between "should we
 * even try to fetch?" and "the bytes are on disk".
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
	 * @throws UpstreamResourceTooLargeError when the declared or streamed size exceeds the per-format limit
	 * @throws UnableToStoreFetchedResourceException when the body cannot be written to disk
	 */
	async fetchToTempFile(request: CacheImageRequest, resourceId: ResourceIdentifierKP, tempPath: string): Promise<void> {
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

		const format = this.getFormatFromUrl(request.resourceTarget)
		const maxBytes = (MAX_FILE_SIZES as Record<string, number>)[format] ?? MAX_FILE_SIZES.default

		const contentLength = response.headers['content-length']
		if (contentLength) {
			const declaredBytes = Number.parseInt(String(contentLength), 10)
			if (!this.resourceValidationService.validateFileSize(declaredBytes, format)) {
				throw new UpstreamResourceTooLargeError(
					`Declared Content-Length ${declaredBytes} bytes exceeds the ${format} limit`,
					{ resource: request.resourceTarget, declaredBytes, maxBytes, format },
				)
			}
		}

		// Streaming byte counter for servers that lie about (or omit) Content-Length.
		// pipeline() destroys every stream — upstream socket included — as soon
		// as any one of them errors, so a tripped guard cannot leak the
		// connection back to the agent pool half-read.
		let bytesSeen = 0
		const sizeGuard = new Transform({
			transform(chunk: Buffer, _encoding, callback) {
				bytesSeen += chunk.length
				if (bytesSeen > maxBytes) {
					callback(new UpstreamResourceTooLargeError(
						`Upstream stream exceeded the ${format} limit after ${bytesSeen} bytes`,
						{ resource: request.resourceTarget, bytesSeen, maxBytes, format },
					))
					return
				}
				callback(null, chunk)
			},
		})

		try {
			await pipeline(response.data, sizeGuard, createWriteStream(tempPath))
		}
		catch (error: unknown) {
			await unlink(tempPath).catch(() => {})
			if (error instanceof UpstreamResourceTooLargeError) {
				throw error
			}
			CorrelatedLogger.error(`Failed to store ${request.resourceTarget} to ${tempPath}: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, ResourceFetcher.name)
			throw new UnableToStoreFetchedResourceException(request.resourceTarget)
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
