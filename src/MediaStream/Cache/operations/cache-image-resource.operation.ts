import type { Buffer } from 'node:buffer'
import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import type { ResourceIdentifierKP } from '#microservice/common/constants/key-properties.constant'
import type { ProcessedImage } from './image-format-processor.service.js'
import { access, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import { PUBLIC_TENANT_SCHEMA } from '#microservice/common/constants/tenant.constant'
import { MediaStreamError } from '#microservice/common/errors/media-stream.errors'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import ResourceMetaData, { resourceMetaVersion } from '#microservice/HTTP/dto/resource-meta-data.dto'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import GenerateResourceIdentityFromRequestJob from '#microservice/Processing/jobs/generate-resource-identity-from-request.job'
import { MultiLayerCacheManager } from '../services/multi-layer-cache.manager.js'
import { imageNamespace } from '../utils/cache-namespace.util.js'
import { AccessCountTracker } from './access-count-tracker.service.js'
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
	/** The full payload when the layered cache had it; a disk-only hit leaves this null until loadResource(). */
	cached: ProcessedImage | null
}

/**
 * Orchestrates caching and processing of image resources.
 *
 * Fetching lives in ResourceFetcher, format processing in ImageFormatProcessor;
 * this class owns identity setup, the cache/filesystem read paths, and the
 * atomic write of processed results.
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
		private readonly accessCountTracker: AccessCountTracker,
		private readonly metricsService: MetricsService,
		configService: ConfigService,
	) {
		this.privateTtl = configService.get('cache.image.privateTtl')
		this.storageDir = storageDirectory(configService)
	}

	getResourcePath(ctx: OperationContext): string {
		return join(this.storageDir, `${ctx.id}.rsc`)
	}

	getResourceTempPath(ctx: OperationContext): string {
		return join(this.storageDir, `${ctx.id}.rst`)
	}

	getResourceMetaPath(ctx: OperationContext): string {
		return join(this.storageDir, `${ctx.id}.rsm`)
	}

	/**
	 * Derive the operation context (request + cache identity) that every
	 * subsequent method takes as its first argument. The controller has
	 * already validated every parameter and the URL.
	 */
	async setup(cacheImageRequest: CacheImageRequest): Promise<OperationContext> {
		PerformanceTracker.startPhase('setup')
		try {
			const id = await this.generateResourceIdentityFromRequestJob.handle(cacheImageRequest)
			CorrelatedLogger.debug(`Resource ID generated: ${id}`, CacheImageResourceOperation.name)
			return { request: cacheImageRequest, id, metaData: null, cached: null }
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Setup failed: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, CacheImageResourceOperation.name)
			this.metricsService.recordError('validation', 'setup')
			throw error
		}
		finally {
			PerformanceTracker.endPhase('setup')
		}
	}

	/**
	 * Whether a valid copy exists — one layered cache lookup (the manager
	 * records that tier's metrics), then the `.rsm`/`.rsc` pair on disk.
	 * On a hit, `ctx.metaData` (and `ctx.cached` for a layered hit) are populated.
	 */
	async checkResourceExists(ctx: OperationContext): Promise<boolean> {
		PerformanceTracker.startPhase('resource_exists_check')
		const tenantSchema = ctx.request.tenantSchema || PUBLIC_TENANT_SCHEMA
		const namespace = imageNamespace(ctx.request.tenantSchema)

		try {
			const cached = await this.cacheManager.get<ProcessedImage>(namespace, ctx.id)
			if (cached) {
				if (typeof cached.metadata?.dateCreated !== 'number') {
					CorrelatedLogger.warn(`Corrupted cache data found, deleting: ${ctx.id}`, CacheImageResourceOperation.name)
					await this.cacheManager.delete(namespace, ctx.id)
				}
				else if (this.isFresh(cached.metadata)) {
					CorrelatedLogger.debug(`Resource found in cache and is valid: ${ctx.id}`, CacheImageResourceOperation.name)
					ctx.cached = cached
					ctx.metaData = cached.metadata
					PerformanceTracker.endPhase('resource_exists_check')
					return true
				}
				else {
					CorrelatedLogger.debug(`Resource found in cache but expired: ${ctx.id}`, CacheImageResourceOperation.name)
					await this.cacheManager.delete(namespace, ctx.id)
				}
			}

			const resourceMetaPath = this.getResourceMetaPath(ctx)
			let metadataContent: string
			try {
				metadataContent = await readFile(resourceMetaPath, 'utf8')
			}
			catch {
				CorrelatedLogger.debug(`Metadata not found in filesystem: ${resourceMetaPath}`, CacheImageResourceOperation.name)
				this.endPhaseAndRecord('resource_exists_check', 'miss', tenantSchema)
				return false
			}

			const resourcePath = this.getResourcePath(ctx)
			if (!await access(resourcePath).then(() => true, () => false)) {
				CorrelatedLogger.debug(`Resource data not found in filesystem: ${resourcePath}`, CacheImageResourceOperation.name)
				this.endPhaseAndRecord('resource_exists_check', 'miss', tenantSchema)
				return false
			}

			let headers: ResourceMetaData
			try {
				headers = new ResourceMetaData(JSON.parse(metadataContent))
			}
			catch {
				CorrelatedLogger.warn(`Metadata sidecar is not valid JSON: ${resourceMetaPath}`, CacheImageResourceOperation.name)
				this.endPhaseAndRecord('resource_exists_check', 'miss', tenantSchema)
				return false
			}

			if (headers.version !== resourceMetaVersion) {
				CorrelatedLogger.warn(`Metadata sidecar has version ${headers.version}, expected ${resourceMetaVersion}: ${resourceMetaPath}`, CacheImageResourceOperation.name)
				this.endPhaseAndRecord('resource_exists_check', 'miss', tenantSchema)
				return false
			}

			const isValid = this.isFresh(headers)
			if (isValid) {
				ctx.metaData = headers
			}
			this.endPhaseAndRecord('resource_exists_check', isValid ? 'hit' : 'miss', tenantSchema)
			return isValid
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Error checking resource existence: ${errorMessage(error)}`, CacheImageResourceOperation.name)
			this.metricsService.recordError('cache_check', 'resource_exists')
			this.endPhaseAndRecord('resource_exists_check', 'error', tenantSchema)
			return false
		}
	}

	/**
	 * The payload of a resource checkResourceExists() reported as present:
	 * the layered copy when it had one, otherwise the `.rsc` file (backfilled
	 * into the layered cache fire-and-forget). Every load counts as an access.
	 * Returns null when the copy vanished between the check and the read.
	 */
	async loadResource(ctx: OperationContext): Promise<ProcessedImage | null> {
		let resource = ctx.cached

		if (!resource) {
			if (!ctx.metaData) {
				return null
			}
			let data: Buffer
			try {
				data = await readFile(this.getResourcePath(ctx))
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(`Cached resource could not be read: ${errorMessage(error)}`, CacheImageResourceOperation.name)
				return null
			}
			resource = { data, metadata: ctx.metaData }
			// Awaiting here would block the response on a Redis/memory write on every filesystem hit
			this.cacheManager.set(imageNamespace(ctx.request.tenantSchema), ctx.id, resource, this.privateTtl).catch((error: unknown) => {
				CorrelatedLogger.warn(`Failed to backfill multi-layer cache for ${ctx.id}: ${errorMessage(error)}`, CacheImageResourceOperation.name)
			})
			CorrelatedLogger.debug(`Resource retrieved from filesystem and cached: ${ctx.id}`, CacheImageResourceOperation.name)
		}

		this.accessCountTracker.record(this.getResourceMetaPath(ctx))
		return resource
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
			CorrelatedLogger.error(`Failed to execute CacheImageResourceOperation: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, CacheImageResourceOperation.name)
			this.metricsService.recordError('image_processing', 'execute')
			this.metricsService.recordImageProcessing('execute', 'unknown', 'error', duration || 0, ctx.request.tenantSchema || PUBLIC_TENANT_SCHEMA)
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

	private isFresh(metadata: ResourceMetaData): boolean {
		return metadata.dateCreated + metadata.privateTTL > Date.now()
	}

	/** End a performance phase and record the filesystem-tier cache metric (the histogram is in seconds). */
	private endPhaseAndRecord(phase: string, result: 'hit' | 'miss' | 'error', tenantSchema: string): void {
		const durationMs = PerformanceTracker.endPhase(phase)
		this.metricsService.recordCacheOperation('get', 'filesystem', result, (durationMs || 0) / 1000, tenantSchema)
	}

	private async processImage(ctx: OperationContext): Promise<ProcessedImage> {
		PerformanceTracker.startPhase('processing')
		const tenantSchema = ctx.request.tenantSchema || PUBLIC_TENANT_SCHEMA

		try {
			const resourceTempPath = this.getResourceTempPath(ctx)
			await this.resourceFetcher.fetchToTempFile(ctx.request, ctx.id, resourceTempPath)

			let processed: ProcessedImage
			// The .rst temp file is removed on every path — Sharp throws
			// mid-pipeline on corrupt/unsupported sources.
			try {
				const isSourceSvg = await this.imageFormatProcessor.detectSvgByHeader(resourceTempPath)
				CorrelatedLogger.debug(`Source file SVG detection: ${isSourceSvg}`, CacheImageResourceOperation.name)

				processed = isSourceSvg
					? await this.imageFormatProcessor.processSvg(resourceTempPath, ctx.request.resizeOptions, tenantSchema)
					: await this.imageFormatProcessor.processRaster(resourceTempPath, ctx.request.resizeOptions, tenantSchema)

				const resourcePath = this.getResourcePath(ctx)
				const resourceMetaPath = this.getResourceMetaPath(ctx)
				// Write to sibling .tmp paths first, then rename() — rename is
				// atomic within one filesystem, so concurrent readers either
				// see the old file or the complete new file, never a partial one.
				const resourceTmpPath = `${resourcePath}.tmp`
				const resourceMetaTmpPath = `${resourceMetaPath}.tmp`

				await Promise.all([
					this.cacheManager.set(imageNamespace(ctx.request.tenantSchema), ctx.id, processed, this.privateTtl),
					writeFile(resourceTmpPath, processed.data),
					writeFile(resourceMetaTmpPath, JSON.stringify(processed.metadata), 'utf8'),
				])
				await Promise.all([
					rename(resourceTmpPath, resourcePath),
					rename(resourceMetaTmpPath, resourceMetaPath),
				])
				this.accessCountTracker.record(resourceMetaPath)
			}
			finally {
				await unlink(resourceTempPath).catch((error: unknown) => {
					CorrelatedLogger.warn(`Failed to delete temporary file: ${errorMessage(error)}`, CacheImageResourceOperation.name)
				})
			}

			const duration = PerformanceTracker.endPhase('processing')
			this.metricsService.recordImageProcessing('process', processed.metadata.format || 'unknown', 'success', duration || 0, tenantSchema)
			CorrelatedLogger.debug(`Image processed successfully: ${ctx.id}`, CacheImageResourceOperation.name)
			return processed
		}
		catch (error: unknown) {
			const duration = PerformanceTracker.endPhase('processing')
			this.metricsService.recordImageProcessing('process', 'unknown', 'error', duration || 0, tenantSchema)
			throw error
		}
	}
}
