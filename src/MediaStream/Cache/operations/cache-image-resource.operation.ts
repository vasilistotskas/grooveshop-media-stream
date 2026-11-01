import type { Buffer } from 'node:buffer'
import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import type { ResourceIdentifierKP } from '#microservice/common/constants/key-properties.constant'
import type ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import type { CacheLayerName } from '../interfaces/cache-layer.interface.js'
import type { ProcessedImage } from './image-format-processor.service.js'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import UnableToFetchResourceException from '#microservice/API/exceptions/unable-to-fetch-resource.exception'
import { PUBLIC_TENANT_SCHEMA } from '#microservice/common/constants/tenant.constant'
import { BackgroundYieldError, isRejectedSource, MediaStreamError, ProcessingOverloadedError } from '#microservice/common/errors/media-stream.errors'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { uploadedSourcePath, uploadKind } from '#microservice/common/utils/upload-source.util'
import { ConfigService } from '#microservice/Config/config.service'
import { currentImageRequest, IMAGE_DECODE_LOG_CONTEXT } from '#microservice/Correlation/utils/image-request-log.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import { resourceMetaVersion } from '#microservice/HTTP/dto/resource-meta-data.dto'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import GenerateResourceIdentityFromRequestJob from '#microservice/Processing/jobs/generate-resource-identity-from-request.job'
import { MultiLayerCacheManager } from '../services/multi-layer-cache.manager.js'
import { RenditionCatalogueService } from '../services/rendition-catalogue.service.js'
import { RenditionSizeService } from '../services/rendition-size.service.js'
import { RenditionStoreService } from '../services/rendition-store.service.js'
import { TenantCacheEpochs } from '../services/tenant-cache-epochs.service.js'
import { imageNamespace } from '../utils/cache-namespace.util.js'
import { ImageFormatProcessor } from './image-format-processor.service.js'
import { ResourceFetcher } from './resource-fetcher.service.js'

/**
 * Per-request state, returned by setup() and threaded through every other
 * method so the singleton operation itself stays stateless.
 */
export interface OperationContext {
	request: CacheImageRequest
	id: ResourceIdentifierKP
	/** Metadata of the cached copy; set by checkResourceExists() when it finds a valid entry. */
	metaData: ResourceMetaData | null
	/** The full payload of the valid copy checkResourceExists() found, whichever tier held it. */
	cached: ProcessedImage | null
	/** Which tier checkResourceExists() found the valid copy in (`store` is the rendition store). */
	cacheTier: CacheLayerName | 'store' | null
	/** The tenant's flush epoch when the request started; a cache write is dropped if a flush landed since. */
	flushEpoch: number
	/**
	 * Names this request's temp files. Requests for one id from different flush
	 * epochs no longer share a deduplicator slot, so two can run at once and
	 * must not write the same temp path.
	 */
	tempToken: string
	/**
	 * Set once the result is being written to the rendition store: resolves true
	 * when the store accepted it. The response does not wait for it (the image is
	 * made, and a slow store must not slow the request); pre-generation does.
	 */
	stored?: Promise<boolean>
	/** The size the request named (`{width}x{height}`), before it was mapped to a preset; absent for a rendition made on the service's own initiative. */
	requestedSize?: string
}

/**
 * Orchestrates caching and processing of image resources.
 *
 * Fetching lives in ResourceFetcher, format processing in ImageFormatProcessor;
 * this class owns identity setup, the read path through the memory, Redis and
 * rendition-store tiers, and the write of processed results to them.
 */
@Injectable()
export default class CacheImageResourceOperation {
	private readonly storageDir: string
	// Configurable TTL in seconds (loaded from config; cache layers expect seconds)
	private readonly privateTtl: number

	constructor(
		private readonly generateResourceIdentityFromRequestJob: GenerateResourceIdentityFromRequestJob,
		private readonly resourceFetcher: ResourceFetcher,
		private readonly imageFormatProcessor: ImageFormatProcessor,
		private readonly cacheManager: MultiLayerCacheManager,
		private readonly renditionStore: RenditionStoreService,
		private readonly renditionCatalogue: RenditionCatalogueService,
		private readonly renditionSizes: RenditionSizeService,
		private readonly metricsService: MetricsService,
		private readonly tenantCacheEpochs: TenantCacheEpochs,
		configService: ConfigService,
	) {
		this.privateTtl = configService.get('cache.image.privateTtl')
		this.storageDir = storageDirectory(configService)
	}

	getResourceTempPath(ctx: OperationContext): string {
		return join(this.storageDir, `${ctx.id}.${ctx.tempToken}.rst`)
	}

	/**
	 * Derive the operation context (request + cache identity) that every
	 * subsequent method takes as its first argument. The controller has
	 * already validated every parameter and the URL.
	 */
	async setup(cacheImageRequest: CacheImageRequest, requestedSize?: string): Promise<OperationContext> {
		PerformanceTracker.startPhase('setup')
		try {
			// Before anything is read or fetched: a flush after this point makes the result stale.
			const flushEpoch = this.tenantCacheEpochs.current(cacheImageRequest.tenantSchema)
			const id = await this.generateResourceIdentityFromRequestJob.handle(cacheImageRequest)
			CorrelatedLogger.debug(`Resource ID generated: ${id}`, CacheImageResourceOperation.name)
			return {
				request: cacheImageRequest,
				id,
				metaData: null,
				cached: null,
				cacheTier: null,
				flushEpoch,
				tempToken: randomUUID(),
				requestedSize,
			}
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Setup failed: ${errorMessage(error)}`, error instanceof Error
				? error.stack
				: undefined, CacheImageResourceOperation.name)
			this.metricsService.recordError('validation', 'setup')
			throw error
		}
		finally {
			PerformanceTracker.endPhase('setup')
		}
	}

	/**
	 * Whether a valid copy exists: one layered cache lookup (the manager records
	 * that tier's metrics), then the rendition store. A store that is off, down
	 * or slow is a miss. On a hit `ctx.cached` and `ctx.metaData` hold the copy.
	 */
	async checkResourceExists(ctx: OperationContext): Promise<boolean> {
		PerformanceTracker.startPhase('resource_exists_check')
		const namespace = imageNamespace(ctx.request.tenantSchema)

		try {
			const lookup = await this.cacheManager.lookup<ProcessedImage>(namespace, ctx.id, () => this.flushedSince(ctx))
			if (lookup) {
				const cached = lookup.value
				if (typeof cached.metadata?.dateCreated !== 'number') {
					CorrelatedLogger.warn(`Corrupted cache data found, deleting: ${ctx.id}`, CacheImageResourceOperation.name)
					await this.cacheManager.delete(namespace, ctx.id)
				}
				else if (this.isFresh(cached.metadata)) {
					CorrelatedLogger.debug(`Resource found in cache and is valid: ${ctx.id}`, CacheImageResourceOperation.name)
					ctx.cached = cached
					ctx.metaData = cached.metadata
					ctx.cacheTier = lookup.layer
					PerformanceTracker.endPhase('resource_exists_check')
					return true
				}
				else {
					CorrelatedLogger.debug(`Resource found in cache but expired: ${ctx.id}`, CacheImageResourceOperation.name)
					await this.cacheManager.delete(namespace, ctx.id)
				}
			}

			const stored = await this.renditionStore.get(ctx.request.tenantSchema, ctx.id)
			PerformanceTracker.endPhase('resource_exists_check')
			if (!stored || typeof stored.metadata?.dateCreated !== 'number' || stored.metadata.version !== resourceMetaVersion || !this.isFresh(stored.metadata)) {
				return false
			}

			ctx.cached = stored
			ctx.metaData = stored.metadata
			ctx.cacheTier = 'store'
			// Awaiting here would block the response on a Redis/memory write on every store hit
			if (!this.flushedSince(ctx)) {
				this.cacheManager.set(namespace, ctx.id, stored, this.privateTtl)
					.then(() => this.discardIfFlushed(ctx))
					.catch((error: unknown) => {
						CorrelatedLogger.warn(`Failed to backfill multi-layer cache for ${ctx.id}: ${errorMessage(error)}`, CacheImageResourceOperation.name)
					})
			}
			CorrelatedLogger.debug(`Resource retrieved from the rendition store and cached: ${ctx.id}`, CacheImageResourceOperation.name)
			return true
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Error checking resource existence: ${errorMessage(error)}`, CacheImageResourceOperation.name)
			this.metricsService.recordError('cache_check', 'resource_exists')
			PerformanceTracker.endPhase('resource_exists_check')
			return false
		}
	}

	/**
	 * Fetch, process and persist the resource; the returned payload is what
	 * the caller streams.
	 * @throws MediaStreamError subclasses unchanged (they carry the HTTP status); anything else as a 500
	 */
	async execute(ctx: OperationContext): Promise<ProcessedImage> {
		PerformanceTracker.startPhase('execute')
		let processed: ProcessedImage
		try {
			processed = await this.processImage(ctx)
		}
		catch (error: unknown) {
			const duration = PerformanceTracker.endPhase('execute')
			// A shed request never reached a pipeline: it is capacity, not a
			// processing failure, and is already counted by admission metrics.
			if (error instanceof ProcessingOverloadedError) {
				if (!(error instanceof BackgroundYieldError)) {
					CorrelatedLogger.warn(`Shed by processing admission: ${errorMessage(error)}`, CacheImageResourceOperation.name)
				}
				throw error
			}
			// A missing or unreachable source was logged where it was raised,
			// at the level it deserves (a 404 is WARN in the fetch job). A
			// source refused by policy is logged only here, so here it keeps
			// its detail, at WARN like its request line. Neither is a fault:
			// an ERROR line would page on a broken link or an oversized upload.
			if (isRejectedSource(error)) {
				CorrelatedLogger.warn(`Source refused: ${errorMessage(error)}`, CacheImageResourceOperation.name)
			}
			else if (!(error instanceof UnableToFetchResourceException)) {
				CorrelatedLogger.error(`Failed to execute CacheImageResourceOperation: ${errorMessage(error)}`, error instanceof Error
					? error.stack
					: undefined, CacheImageResourceOperation.name)
			}
			this.metricsService.recordError('image_processing', 'execute')
			this.metricsService.recordImageProcessing('execute', 'unknown', 'error', duration || 0)
			if (error instanceof MediaStreamError) {
				throw error
			}
			throw new InternalServerErrorException('Error fetching or processing image.')
		}
		PerformanceTracker.endPhase('execute')
		return processed
	}

	/**
	 * Resize/optimize the bundled default image (fallback path).
	 * Delegates to ImageFormatProcessor; kept on the operation so the public
	 * API consumed by ImageStreamService stays in one place.
	 */
	async optimizeAndServeDefaultImage(resizeOptions: ResizeOptions): Promise<Buffer> {
		return this.imageFormatProcessor.optimizeAndServeDefaultImage(resizeOptions)
	}

	/** Whether a flush of this request's tenant landed after the request started. */
	private flushedSince(ctx: OperationContext): boolean {
		return this.tenantCacheEpochs.flushedSince(ctx.request.tenantSchema, ctx.flushEpoch)
	}

	/**
	 * Remove what this request cached if a flush landed while it was writing.
	 * The flush advances the epoch before it clears anything, so a write that
	 * finishes after the clear is caught here and one that finished before it
	 * is removed by the clear itself. A copy that is already gone is expected.
	 */
	private async discardIfFlushed(ctx: OperationContext): Promise<void> {
		if (!this.flushedSince(ctx)) {
			return
		}
		CorrelatedLogger.debug(`Tenant flushed while ${ctx.id} was being cached, discarding the copy`, CacheImageResourceOperation.name)
		const results = await Promise.allSettled([
			this.cacheManager.delete(imageNamespace(ctx.request.tenantSchema), ctx.id),
			this.renditionStore.delete(ctx.request.tenantSchema, ctx.id),
		])
		for (const result of results) {
			if (result.status === 'rejected') {
				CorrelatedLogger.warn(`Could not remove a copy cached across a tenant flush for ${ctx.id}: ${errorMessage(result.reason)}`, CacheImageResourceOperation.name)
			}
		}
	}

	private isFresh(metadata: ResourceMetaData): boolean {
		return metadata.dateCreated + metadata.privateTTL > Date.now()
	}

	/**
	 * One info line before a fetched source reaches a decoder. The request
	 * line is written when the response closes, so a decode that kills the
	 * process (the 2026-09-25 heap OOM) leaves none; this line survives it,
	 * and an `ImageDecode` line without a matching `ImageRequest` line
	 * names the request that took the pod down. Misses only: cache hits,
	 * the bulk of the traffic, never get here.
	 */
	private logDecodeStart(ctx: OperationContext): void {
		const log = currentImageRequest()
		if (!log) {
			return
		}
		CorrelatedLogger.event('log', `image decode ${log.inputFormat ?? 'unknown'} ${log.inputBytes ?? 0}B`, {
			correlation_id: log.correlationId,
			schema: log.schema,
			source: log.source,
			path: log.path,
			resource_id: ctx.id,
			input_format: log.inputFormat,
			input_bytes: log.inputBytes,
		}, IMAGE_DECODE_LOG_CONTEXT)
	}

	/**
	 * Cache a processed result in the layered cache and the rendition store.
	 * Skipped when a flush of the tenant landed since the request started (the
	 * result was built from data the flush meant to drop; this request still
	 * serves it), and undone when one lands during the write. The layered write is
	 * awaited; the store write is not (see `OperationContext.stored`).
	 */
	private async persist(ctx: OperationContext, processed: ProcessedImage): Promise<void> {
		if (this.flushedSince(ctx)) {
			CorrelatedLogger.debug(`Tenant flushed while ${ctx.id} was processing, not caching the result`, CacheImageResourceOperation.name)
			return
		}

		await this.cacheManager.set(imageNamespace(ctx.request.tenantSchema), ctx.id, processed, this.privateTtl)
		ctx.stored = this.writeToStore(ctx, processed)
		if (this.flushedSince(ctx)) {
			await this.discardIfFlushed(ctx)
		}
	}

	/** The store write: true when it landed and survived any flush, false when the store refused it (counted, the image is served uncached). Never rejects. */
	private async writeToStore(ctx: OperationContext, processed: ProcessedImage): Promise<boolean> {
		try {
			await this.renditionStore.put(ctx.request.tenantSchema, ctx.id, processed)
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Could not store ${ctx.id}, it is served uncached: ${errorMessage(error)}`, CacheImageResourceOperation.name)
			this.metricsService.recordError('cache_persist', 'write')
			return false
		}
		if (this.flushedSince(ctx)) {
			await this.discardIfFlushed(ctx)
			return false
		}
		const source = uploadedSourcePath(ctx.request.resourceTarget)
		if (source !== null) {
			void this.renditionCatalogue.record(uploadKind(source), ctx.request.resizeOptions)
			if (ctx.requestedSize !== undefined) {
				void this.renditionSizes.recordRendering(ctx.requestedSize)
			}
		}
		return true
	}

	private async processImage(ctx: OperationContext): Promise<ProcessedImage> {
		PerformanceTracker.startPhase('processing')
		const tenantSchema = ctx.request.tenantSchema || PUBLIC_TENANT_SCHEMA

		try {
			const resourceTempPath = this.getResourceTempPath(ctx)
			// The fetcher sniffs the real format from the bytes; it decides both
			// the size limit and which pipeline runs.
			const source = await this.resourceFetcher.fetchToTempFile(ctx.request, ctx.id, resourceTempPath)
			this.metricsService.recordImageInput(source.format, source.bytes)
			this.logDecodeStart(ctx)

			let processed: ProcessedImage
			// The .rst temp file is removed on every path — Sharp throws
			// mid-pipeline on corrupt/unsupported sources.
			try {
				processed = source.format === 'svg'
					? await this.imageFormatProcessor.processSvg(resourceTempPath, ctx.request.resizeOptions, tenantSchema)
					: await this.imageFormatProcessor.processRaster(resourceTempPath, ctx.request.resizeOptions, tenantSchema)

				// Caching is best effort: the image is already made, and a cache that
				// cannot be written must cost the next request an encode, not turn this
				// one into the default image.
				await this.persist(ctx, processed).catch((error: unknown) => {
					CorrelatedLogger.warn(`Could not cache ${ctx.id}, serving it uncached: ${errorMessage(error)}`, CacheImageResourceOperation.name)
					this.metricsService.recordError('cache_persist', 'write')
				})
			}
			finally {
				await unlink(resourceTempPath).catch((error: unknown) => {
					CorrelatedLogger.warn(`Failed to delete temporary file: ${errorMessage(error)}`, CacheImageResourceOperation.name)
				})
			}

			const duration = PerformanceTracker.endPhase('processing')
			this.metricsService.recordImageProcessing('process', processed.metadata.format || 'unknown', 'success', duration || 0)
			CorrelatedLogger.debug(`Image processed successfully: ${ctx.id}`, CacheImageResourceOperation.name)
			return processed
		}
		catch (error: unknown) {
			const duration = PerformanceTracker.endPhase('processing')
			if (!(error instanceof ProcessingOverloadedError)) {
				this.metricsService.recordImageProcessing('process', 'unknown', 'error', duration || 0)
			}
			throw error
		}
	}
}
