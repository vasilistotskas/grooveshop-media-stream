import type {
	ResizeOptions,
} from '#microservice/API/dto/cache-image-request.dto'
import type { ResourceIdentifierKP } from '#microservice/common/constants/key-properties.constant'
import type { ProcessedImage } from './image-format-processor.service.js'
import { Buffer } from 'node:buffer'
import { access, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { cwd } from 'node:process'
import { Injectable, InternalServerErrorException } from '@nestjs/common'

import CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import { MediaStreamError } from '#microservice/common/errors/media-stream.errors'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import GenerateResourceIdentityFromRequestJob from '#microservice/Processing/jobs/generate-resource-identity-from-request.job'
import ValidateCacheImageRequestRule from '#microservice/Validation/rules/validate-cache-image-request.rule'
import { InputSanitizationService } from '#microservice/Validation/services/input-sanitization.service'
import { MultiLayerCacheManager } from '../services/multi-layer-cache.manager.js'
import { ImageFormatProcessor } from './image-format-processor.service.js'
import { ResourceFetcher } from './resource-fetcher.service.js'

/**
 * Operation context for a single cache image request.
 * Created per-request to hold request-specific state.
 * This is returned from setup() and passed to all subsequent methods.
 */
export interface OperationContext {
	request: CacheImageRequest
	id: ResourceIdentifierKP
	metaData: ResourceMetaData | null
}

/**
 * Orchestrates caching and processing of image resources.
 * Singleton service - request-specific state is managed via OperationContext parameter.
 *
 * Fetching lives in ResourceFetcher, format processing in ImageFormatProcessor;
 * this class owns validation/identity setup, the cache/filesystem read paths,
 * and the atomic write of processed results.
 *
 * IMPORTANT: This service is STATELESS. All request-specific data is passed via
 * the OperationContext parameter returned from setup() and passed to all methods.
 * This ensures thread-safety for concurrent requests.
 */
@Injectable()
export default class CacheImageResourceOperation {
	private readonly basePath = cwd()

	// Configurable TTL in seconds (loaded from config; cache layers expect seconds)
	private readonly privateTtl: number

	constructor(
		private readonly validateCacheImageRequest: ValidateCacheImageRequestRule,
		private readonly generateResourceIdentityFromRequestJob: GenerateResourceIdentityFromRequestJob,
		private readonly resourceFetcher: ResourceFetcher,
		private readonly imageFormatProcessor: ImageFormatProcessor,
		private readonly cacheManager: MultiLayerCacheManager,
		private readonly inputSanitizationService: InputSanitizationService,
		private readonly metricsService: MetricsService,
		private readonly configService: ConfigService,
	) {
		this.privateTtl = this.configService.getOptional('cache.image.privateTtl', 6 * 30 * 24 * 3600)
	}

	/**
	 * Get resource file path for a given context
	 */
	getResourcePath(ctx: OperationContext): string {
		return path.join(this.basePath, 'storage', `${ctx.id}.rsc`)
	}

	/**
	 * Get resource temp file path for a given context
	 */
	getResourceTempPath(ctx: OperationContext): string {
		return path.join(this.basePath, 'storage', `${ctx.id}.rst`)
	}

	/**
	 * Get resource metadata file path for a given context
	 */
	getResourceMetaPath(ctx: OperationContext): string {
		return path.join(this.basePath, 'storage', `${ctx.id}.rsm`)
	}

	/**
	 * End a performance phase and record the cache operation metric in one step.
	 */
	private endPhaseAndRecord(phase: string, layer: string, result: 'hit' | 'miss' | 'error'): void {
		const duration = PerformanceTracker.endPhase(phase)
		this.metricsService.recordCacheOperation('get', layer, result, duration || 0)
	}

	/**
	 * Check if the resource exists in cache or filesystem
	 * @param ctx - Operation context containing request-specific state
	 * @returns true if resource exists and is valid
	 */
	async checkResourceExists(ctx: OperationContext): Promise<boolean> {
		PerformanceTracker.startPhase('resource_exists_check')

		try {
			CorrelatedLogger.debug(`Checking if resource exists in cache: ${ctx.id}`, CacheImageResourceOperation.name)

			const cachedResource = await this.cacheManager.get<{ data: Buffer, metadata: ResourceMetaData }>('image', ctx.id)
			if (cachedResource) {
				if (!cachedResource.metadata || typeof cachedResource.metadata.dateCreated !== 'number') {
					CorrelatedLogger.warn(`Corrupted cache data found, deleting: ${ctx.id}`, CacheImageResourceOperation.name)
					await this.cacheManager.delete('image', ctx.id)
				}
				else {
					const isValid = cachedResource.metadata.dateCreated + cachedResource.metadata.privateTTL > Date.now()
					if (isValid) {
						CorrelatedLogger.debug(`Resource found in cache and is valid: ${ctx.id}`, CacheImageResourceOperation.name)
						this.endPhaseAndRecord('resource_exists_check', 'multi-layer', 'hit')
						return true
					}
					else {
						CorrelatedLogger.debug(`Resource found in cache but expired: ${ctx.id}`, CacheImageResourceOperation.name)
						await this.cacheManager.delete('image', ctx.id)
					}
				}
			}

			// Check filesystem: try reading metadata directly (1 syscall instead of access+access+readFile)
			const resourceMetaPath = this.getResourceMetaPath(ctx)
			let metadataContent: string | null = null
			try {
				metadataContent = await readFile(resourceMetaPath, 'utf8')
			}
			catch {
				// Metadata file doesn't exist — resource not cached on disk
			}

			if (!metadataContent) {
				CorrelatedLogger.debug(`Metadata not found in filesystem: ${resourceMetaPath}`, CacheImageResourceOperation.name)
				this.endPhaseAndRecord('resource_exists_check', 'multi-layer', 'miss')
				return false
			}

			// Verify the resource data file exists
			const resourcePath = this.getResourcePath(ctx)
			const resourcePathExists = await access(resourcePath).then(() => true).catch(() => false)
			if (!resourcePathExists) {
				CorrelatedLogger.debug(`Resource data not found in filesystem: ${resourcePath}`, CacheImageResourceOperation.name)
				this.endPhaseAndRecord('resource_exists_check', 'multi-layer', 'miss')
				return false
			}

			let headers: ResourceMetaData
			try {
				headers = new ResourceMetaData(JSON.parse(metadataContent))
				ctx.metaData = headers
			}
			catch {
				CorrelatedLogger.warn('Metadata headers are missing or invalid', CacheImageResourceOperation.name)
				this.endPhaseAndRecord('resource_exists_check', 'multi-layer', 'miss')
				return false
			}

			if (!headers.version || headers.version !== 1) {
				CorrelatedLogger.warn('Invalid or missing version in metadata', CacheImageResourceOperation.name)
				this.endPhaseAndRecord('resource_exists_check', 'multi-layer', 'miss')
				return false
			}

			const isValid = headers.dateCreated + headers.privateTTL > Date.now()
			this.endPhaseAndRecord('resource_exists_check', 'multi-layer', isValid ? 'hit' : 'miss')
			return isValid
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Error checking resource existence: ${(error as Error).message}`, CacheImageResourceOperation.name)
			this.metricsService.recordError('cache_check', 'resource_exists')
			this.endPhaseAndRecord('resource_exists_check', 'multi-layer', 'error')
			return false
		}
	}

	/**
	 * Fetch resource metadata headers
	 * @param ctx - Operation context containing request-specific state
	 * @returns Resource metadata or empty metadata if not found
	 */
	async fetchHeaders(ctx: OperationContext): Promise<ResourceMetaData> {
		if (!ctx.metaData) {
			try {
				const cachedResource = await this.getCachedResource(ctx)
				if (cachedResource && cachedResource.metadata) {
					ctx.metaData = cachedResource.metadata
					return ctx.metaData
				}

				const resourceMetaPath = this.getResourceMetaPath(ctx)
				try {
					const content = await readFile(resourceMetaPath, 'utf8')
					ctx.metaData = new ResourceMetaData(JSON.parse(content))
				}
				catch {
					CorrelatedLogger.warn('Metadata file does not exist.', CacheImageResourceOperation.name)
					return new ResourceMetaData()
				}
			}
			catch (error: unknown) {
				CorrelatedLogger.error(`Failed to read or parse resource metadata: ${error}`, '', CacheImageResourceOperation.name)
				return new ResourceMetaData()
			}
		}
		return ctx.metaData
	}

	/**
	 * Setup the operation context for a cache image request.
	 * Returns the context that must be passed to all subsequent methods.
	 * @param cacheImageRequest - The incoming cache image request
	 * @returns OperationContext to be passed to other methods
	 */
	public async setup(cacheImageRequest: CacheImageRequest): Promise<OperationContext> {
		PerformanceTracker.startPhase('setup')

		try {
			CorrelatedLogger.debug('Setting up cache image resource operation', CacheImageResourceOperation.name)

			// sanitize() returns a plain object; reconstruct on the class prototype
			// so that downstream code that checks instanceof CacheImageRequest works
			// correctly and any class-level methods remain accessible.
			const sanitizedPlain = await this.inputSanitizationService.sanitize(cacheImageRequest)
			const sanitizedRequest = Object.assign(new CacheImageRequest(), sanitizedPlain)

			if (sanitizedRequest.resourceTarget && !this.inputSanitizationService.validateUrl(sanitizedRequest.resourceTarget)) {
				throw new Error(`Invalid or disallowed URL: ${sanitizedRequest.resourceTarget}`)
			}

			if (sanitizedRequest.resizeOptions?.width && sanitizedRequest.resizeOptions?.height) {
				if (!this.inputSanitizationService.validateImageDimensions(sanitizedRequest.resizeOptions.width, sanitizedRequest.resizeOptions.height)) {
					throw new Error(`Invalid image dimensions: ${sanitizedRequest.resizeOptions.width}x${sanitizedRequest.resizeOptions.height}`)
				}
			}

			// Use the new validate() method
			await this.validateCacheImageRequest.validate(sanitizedRequest)

			const resourceId = await this.generateResourceIdentityFromRequestJob.handle(sanitizedRequest)

			// Create and return the operation context
			const context: OperationContext = {
				request: sanitizedRequest,
				id: resourceId,
				metaData: null,
			}

			CorrelatedLogger.debug(`Resource ID generated: ${resourceId}`, CacheImageResourceOperation.name)

			return context
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Setup failed: ${(error as Error).message}`, (error as Error).stack, CacheImageResourceOperation.name)
			this.metricsService.recordError('validation', 'setup')
			throw error
		}
		finally {
			PerformanceTracker.endPhase('setup')
		}
	}

	/**
	 * Execute the cache image resource operation
	 * @param ctx - Operation context containing request-specific state
	 */
	public async execute(ctx: OperationContext): Promise<void> {
		PerformanceTracker.startPhase('execute')
		let phaseEnded = false

		try {
			CorrelatedLogger.debug('Executing cache image resource operation', CacheImageResourceOperation.name)

			await this.processImageSynchronously(ctx)
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Failed to execute CacheImageResourceOperation: ${(error as Error).message}`, (error as Error).stack, CacheImageResourceOperation.name)
			this.metricsService.recordError('image_processing', 'execute')
			const duration = PerformanceTracker.endPhase('execute')
			phaseEnded = true
			this.metricsService.recordImageProcessing('execute', 'unknown', 'error', duration || 0)
			// Preserve typed MediaStreamError subclasses (e.g. UnableToFetchResourceException)
			// so callers see the correct HTTP status. Only wrap truly unknown errors.
			if (error instanceof MediaStreamError) {
				throw error
			}
			throw new InternalServerErrorException('Error fetching or processing image.')
		}
		finally {
			if (!phaseEnded) {
				PerformanceTracker.endPhase('execute')
			}
		}
	}

	private async processImageSynchronously(ctx: OperationContext): Promise<void> {
		PerformanceTracker.startPhase('sync_processing')

		try {
			const resourceTempPath = this.getResourceTempPath(ctx)
			await this.resourceFetcher.fetchToTempFile(ctx.request, ctx.id, resourceTempPath)

			let processed: ProcessedImage

			// Wrap the Sharp processing block so resourceTempPath (.rst) is always
			// cleaned up — even on corrupt/unsupported image errors that Sharp throws
			// mid-pipeline.  The finally guard is a no-op if the file was already
			// removed on the success path.
			try {
				const isSourceSvg = await this.imageFormatProcessor.detectSvgByHeader(resourceTempPath)
				CorrelatedLogger.debug(`Source file SVG detection: ${isSourceSvg}`, CacheImageResourceOperation.name)

				processed = isSourceSvg
					? await this.imageFormatProcessor.processSvg(resourceTempPath, ctx.request.resizeOptions)
					: await this.imageFormatProcessor.processRaster(resourceTempPath, ctx.request.resizeOptions)

				const resourcePath = this.getResourcePath(ctx)
				const resourceMetaPath = this.getResourceMetaPath(ctx)
				// Write to sibling .tmp paths first, then rename() — rename is
				// atomic on POSIX within the same filesystem, so concurrent
				// readers either see the old file or the complete new file.
				// Direct writeFile() was visible while still being written,
				// returning partial buffers to concurrent requests.
				const resourceTmpPath = `${resourcePath}.tmp`
				const resourceMetaTmpPath = `${resourceMetaPath}.tmp`

				await Promise.all([
					this.cacheManager.set('image', ctx.id, {
						data: processed.data,
						metadata: processed.metadata,
					}, this.privateTtl),
					writeFile(resourceTmpPath, processed.data),
					writeFile(resourceMetaTmpPath, JSON.stringify(processed.metadata), 'utf8'),
				])
				await Promise.all([
					rename(resourceTmpPath, resourcePath),
					rename(resourceMetaTmpPath, resourceMetaPath),
				])
			}
			finally {
				// Always remove the .rst temp file: success path removes it here,
				// error path also lands here so no orphan is left on disk.
				await unlink(resourceTempPath).catch((error: unknown) => {
					CorrelatedLogger.warn(`Failed to delete temporary file: ${(error as Error).message}`, CacheImageResourceOperation.name)
				})
			}

			const processedFormat = processed.metadata.format || 'unknown'
			const duration = PerformanceTracker.endPhase('sync_processing')
			this.metricsService.recordImageProcessing('process', processedFormat, 'success', duration || 0)
			CorrelatedLogger.debug(`Image processed successfully: ${ctx.id}`, CacheImageResourceOperation.name)
		}
		catch (error: unknown) {
			const duration = PerformanceTracker.endPhase('sync_processing')
			this.metricsService.recordImageProcessing('process', 'unknown', 'error', duration || 0)
			throw error
		}
	}

	/**
	 * Resize/optimize the bundled default image (fallback path).
	 * Delegates to ImageFormatProcessor; kept on the operation so the public
	 * API consumed by ImageStreamService stays in one place.
	 */
	public async optimizeAndServeDefaultImage(resizeOptions: ResizeOptions): Promise<Buffer> {
		return this.imageFormatProcessor.optimizeAndServeDefaultImage(resizeOptions)
	}

	/**
	 * Get cached resource data from multi-layer cache or filesystem
	 * @param ctx - Operation context containing request-specific state
	 */
	public async getCachedResource(ctx: OperationContext): Promise<{ data: Buffer, metadata: ResourceMetaData } | null> {
		PerformanceTracker.startPhase('get_cached_resource')

		try {
			let cachedResource = await this.cacheManager.get<{ data: Buffer, metadata: ResourceMetaData }>('image', ctx.id)

			if (cachedResource && (!cachedResource.metadata || typeof cachedResource.metadata.dateCreated !== 'number')) {
				CorrelatedLogger.warn(`Corrupted cache data found in getCachedResource, deleting: ${ctx.id}`, CacheImageResourceOperation.name)
				await this.cacheManager.delete('image', ctx.id)
				cachedResource = null
			}

			if (cachedResource) {
				// Increment access count and backfill updated metadata into cache (fire-and-forget)
				cachedResource.metadata.accessCount = (cachedResource.metadata.accessCount || 0) + 1
				this.cacheManager.set('image', ctx.id, cachedResource, this.privateTtl).catch((err: unknown) => {
					CorrelatedLogger.warn(`Failed to backfill access count for ${ctx.id}: ${(err as Error).message}`, CacheImageResourceOperation.name)
				})

				CorrelatedLogger.debug(`Resource retrieved from cache: ${ctx.id}`, CacheImageResourceOperation.name)
				this.endPhaseAndRecord('get_cached_resource', 'multi-layer', 'hit')
				return cachedResource
			}

			const resourcePath = this.getResourcePath(ctx)
			const resourceMetaPath = this.getResourceMetaPath(ctx)

			// Read both files in parallel — no separate access() checks needed
			const [dataResult, metaResult] = await Promise.allSettled([
				readFile(resourcePath),
				readFile(resourceMetaPath, 'utf8'),
			])

			if (dataResult.status === 'fulfilled' && metaResult.status === 'fulfilled') {
				const data = dataResult.value
				const metadata = new ResourceMetaData(JSON.parse(metaResult.value))

				// Increment access count and persist back to the .rsm file (fire-and-forget)
				metadata.accessCount = (metadata.accessCount || 0) + 1
				writeFile(resourceMetaPath, JSON.stringify(metadata), 'utf8').catch((err: unknown) => {
					CorrelatedLogger.warn(`Failed to persist access count to ${resourceMetaPath}: ${(err as Error).message}`, CacheImageResourceOperation.name)
				})

				await this.cacheManager.set('image', ctx.id, { data, metadata }, this.privateTtl)

				CorrelatedLogger.debug(`Resource retrieved from filesystem and cached: ${ctx.id}`, CacheImageResourceOperation.name)
				this.endPhaseAndRecord('get_cached_resource', 'filesystem', 'hit')
				return { data, metadata }
			}

			CorrelatedLogger.debug(`Resource not found: ${ctx.id}`, CacheImageResourceOperation.name)
			this.endPhaseAndRecord('get_cached_resource', 'multi-layer', 'miss')
			return null
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Failed to get cached resource: ${(error as Error).message}`, (error as Error).stack, CacheImageResourceOperation.name)
			this.metricsService.recordError('cache_retrieval', 'get_cached_resource')
			this.endPhaseAndRecord('get_cached_resource', 'multi-layer', 'error')
			return null
		}
	}
}
