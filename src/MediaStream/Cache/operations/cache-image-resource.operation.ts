import type {
	ResizeOptions,
} from '#microservice/API/dto/cache-image-request.dto'
import type { ResourceIdentifierKP } from '#microservice/common/constants/key-properties.constant'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { access, readFile, unlink, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { cwd } from 'node:process'
import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	SupportedResizeFormats,
} from '#microservice/API/dto/cache-image-request.dto'
import UnableToFetchResourceException from '#microservice/API/exceptions/unable-to-fetch-resource.exception'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { PerformanceTracker } from '#microservice/Correlation/utils/performance-tracker.util'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import FetchResourceResponseJob from '#microservice/Queue/jobs/fetch-resource-response.job'
import GenerateResourceIdentityFromRequestJob from '#microservice/Queue/jobs/generate-resource-identity-from-request.job'
import StoreResourceResponseToFileJob from '#microservice/Queue/jobs/store-resource-response-to-file.job'
import WebpImageManipulationJob from '#microservice/Queue/jobs/webp-image-manipulation.job'
import { JobQueueManager } from '#microservice/Queue/services/job-queue.manager'
import { JobPriority } from '#microservice/Queue/types/job.types'
import ValidateCacheImageRequestRule from '#microservice/Validation/rules/validate-cache-image-request.rule'
import { InputSanitizationService } from '#microservice/Validation/services/input-sanitization.service'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { MultiLayerCacheManager } from '../services/multi-layer-cache.manager.js'

/**
 * Operation context for a single cache image request.
 * Created per-request to hold request-specific state.
 */
interface OperationContext {
	request: CacheImageRequest
	id: ResourceIdentifierKP
	metaData: ResourceMetaData | null
}

/**
 * Handles caching and processing of image resources.
 * Singleton service - request-specific state is managed via OperationContext.
 */
@Injectable()
export default class CacheImageResourceOperation {
	private readonly basePath = cwd()

	/**
	 * Current operation context - set during setup() and used throughout the operation.
	 * This allows the service to be a singleton while still handling per-request state.
	 */
	private context!: OperationContext

	constructor(
		private readonly validateCacheImageRequest: ValidateCacheImageRequestRule,
		private readonly fetchResourceResponseJob: FetchResourceResponseJob,
		private readonly webpImageManipulationJob: WebpImageManipulationJob,
		private readonly storeResourceResponseToFileJob: StoreResourceResponseToFileJob,
		private readonly generateResourceIdentityFromRequestJob: GenerateResourceIdentityFromRequestJob,
		private readonly cacheManager: MultiLayerCacheManager,
		private readonly inputSanitizationService: InputSanitizationService,
		private readonly jobQueueManager: JobQueueManager,
		private readonly metricsService: MetricsService,
	) { }

	get getResourcePath(): string {
		return path.join(this.basePath, 'storage', `${this.context.id}.rsc`)
	}

	get getResourceTempPath(): string {
		return path.join(this.basePath, 'storage', `${this.context.id}.rst`)
	}

	get getResourceMetaPath(): string {
		return path.join(this.basePath, 'storage', `${this.context.id}.rsm`)
	}

	/**
	 * Check if the resource exists in cache or filesystem
	 * @returns true if resource exists and is valid
	 */
	async checkResourceExists(): Promise<boolean> {
		PerformanceTracker.startPhase('resource_exists_check')

		try {
			CorrelatedLogger.debug(`Checking if resource exists in cache: ${this.context.id}`, CacheImageResourceOperation.name)

			const cachedResource = await this.cacheManager.get<{ data: Buffer, metadata: ResourceMetaData }>('image', this.context.id)
			if (cachedResource) {
				if (!cachedResource.metadata || typeof cachedResource.metadata.dateCreated !== 'number') {
					CorrelatedLogger.warn(`Corrupted cache data found, deleting: ${this.context.id}`, CacheImageResourceOperation.name)
					await this.cacheManager.delete('image', this.context.id)
				}
				else {
					const isValid = cachedResource.metadata.dateCreated + cachedResource.metadata.privateTTL > Date.now()
					if (isValid) {
						CorrelatedLogger.debug(`Resource found in cache and is valid: ${this.context.id}`, CacheImageResourceOperation.name)
						const duration = PerformanceTracker.endPhase('resource_exists_check')
						this.metricsService.recordCacheOperation('get', 'multi-layer', 'hit', duration || 0)
						return true
					}
					else {
						CorrelatedLogger.debug(`Resource found in cache but expired: ${this.context.id}`, CacheImageResourceOperation.name)
						await this.cacheManager.delete('image', this.context.id)
					}
				}
			}

			const resourcePathExists = await access(this.getResourcePath).then(() => true).catch(() => false)
			if (!resourcePathExists) {
				CorrelatedLogger.debug(`Resource not found in filesystem: ${this.getResourcePath}`, CacheImageResourceOperation.name)
				const duration = PerformanceTracker.endPhase('resource_exists_check')
				this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss', duration || 0)
				return false
			}

			const resourceMetaPathExists = await access(this.getResourceMetaPath).then(() => true).catch(() => false)
			if (!resourceMetaPathExists) {
				CorrelatedLogger.warn(`Metadata path does not exist: ${this.getResourceMetaPath}`, CacheImageResourceOperation.name)
				const duration = PerformanceTracker.endPhase('resource_exists_check')
				this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss', duration || 0)
				return false
			}

			const headers = await this.fetchHeaders()

			if (!headers) {
				CorrelatedLogger.warn('Metadata headers are missing or invalid', CacheImageResourceOperation.name)
				const duration = PerformanceTracker.endPhase('resource_exists_check')
				this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss', duration || 0)
				return false
			}

			if (!headers.version || headers.version !== 1) {
				CorrelatedLogger.warn('Invalid or missing version in metadata', CacheImageResourceOperation.name)
				const duration = PerformanceTracker.endPhase('resource_exists_check')
				this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss', duration || 0)
				return false
			}

			const isValid = headers.dateCreated + headers.privateTTL > Date.now()
			const duration = PerformanceTracker.endPhase('resource_exists_check')
			this.metricsService.recordCacheOperation('get', 'multi-layer', isValid ? 'hit' : 'miss', duration || 0)
			return isValid
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Error checking resource existence: ${(error as Error).message}`, CacheImageResourceOperation.name)
			this.metricsService.recordError('cache_check', 'resource_exists')
			const duration = PerformanceTracker.endPhase('resource_exists_check')
			this.metricsService.recordCacheOperation('get', 'multi-layer', 'error', duration || 0)
			return false
		}
	}

	/**
	 * Fetch resource metadata headers
	 * @returns Resource metadata or empty metadata if not found
	 */
	async fetchHeaders(): Promise<ResourceMetaData> {
		if (!this.context.metaData) {
			try {
				const cachedResource = await this.getCachedResource()
				if (cachedResource && cachedResource.metadata) {
					this.context.metaData = cachedResource.metadata
					return this.context.metaData
				}

				const exists = await access(this.getResourceMetaPath).then(() => true).catch(() => false)
				if (exists) {
					const content = await readFile(this.getResourceMetaPath, 'utf8')
					this.context.metaData = new ResourceMetaData(JSON.parse(content))
				}
				else {
					CorrelatedLogger.warn('Metadata file does not exist.', CacheImageResourceOperation.name)
					return new ResourceMetaData()
				}
			}
			catch (error: unknown) {
				CorrelatedLogger.error(`Failed to read or parse resource metadata: ${error}`, '', CacheImageResourceOperation.name)
				return new ResourceMetaData()
			}
		}
		return this.context.metaData
	}

	public async setup(cacheImageRequest: CacheImageRequest): Promise<void> {
		PerformanceTracker.startPhase('setup')

		try {
			CorrelatedLogger.debug('Setting up cache image resource operation', CacheImageResourceOperation.name)

			const sanitizedRequest = await this.inputSanitizationService.sanitize(cacheImageRequest) as CacheImageRequest

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

			// Initialize the operation context
			this.context = {
				request: sanitizedRequest,
				id: resourceId,
				metaData: null,
			}

			CorrelatedLogger.debug(`Resource ID generated: ${this.context.id}`, CacheImageResourceOperation.name)
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

	public async execute(): Promise<void> {
		PerformanceTracker.startPhase('execute')

		try {
			CorrelatedLogger.debug('Executing cache image resource operation', CacheImageResourceOperation.name)

			if (await this.checkResourceExists()) {
				CorrelatedLogger.log('Resource already exists in cache', CacheImageResourceOperation.name)
				const duration = PerformanceTracker.endPhase('execute')
				this.metricsService.recordImageProcessing('cache_check', 'cached', 'success', duration || 0)
				return
			}

			const shouldUseQueue = this.shouldUseBackgroundProcessing()

			if (shouldUseQueue) {
				CorrelatedLogger.debug('Queuing image processing job for background processing', CacheImageResourceOperation.name)
				await this.queueImageProcessing()
				return
			}

			await this.processImageSynchronously()
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Failed to execute CacheImageResourceOperation: ${(error as Error).message}`, (error as Error).stack, CacheImageResourceOperation.name)
			this.metricsService.recordError('image_processing', 'execute')
			const duration = PerformanceTracker.endPhase('execute')
			this.metricsService.recordImageProcessing('execute', 'unknown', 'error', duration || 0)
			throw new InternalServerErrorException('Error fetching or processing image.')
		}
		finally {
			PerformanceTracker.endPhase('execute')
		}
	}

	public shouldUseBackgroundProcessing(): boolean {
		const resizeOptions = this.context.request.resizeOptions
		if (!resizeOptions)
			return false

		const width = resizeOptions.width || 0
		const height = resizeOptions.height || 0
		const totalPixels = width * height

		if (resizeOptions.format === 'svg') {
			return false
		}

		if (totalPixels > 8000000) {
			CorrelatedLogger.warn(`Image is too large to be processed synchronously: ${totalPixels} pixels`, CacheImageResourceOperation.name)
			return true
		}

		return false
	}

	private async queueImageProcessing(): Promise<void> {
		const resizeOptions = this.context.request.resizeOptions
		const priority = resizeOptions?.width && resizeOptions.width > 1920
			? JobPriority.LOW
			: JobPriority.NORMAL

		await this.jobQueueManager.addImageProcessingJob({
			imageUrl: this.context.request.resourceTarget,
			width: resizeOptions?.width ?? undefined,
			height: resizeOptions?.height ?? undefined,
			quality: resizeOptions?.quality,
			format: resizeOptions?.format as 'webp' | 'jpeg' | 'png',
			fit: resizeOptions?.fit,
			position: resizeOptions?.position,
			background: resizeOptions?.background,
			trimThreshold: resizeOptions?.trimThreshold ?? undefined,
			cacheKey: this.context.id,
			priority,
		})

		CorrelatedLogger.debug(`Image processing job queued with priority: ${priority}`, CacheImageResourceOperation.name)
	}

	private async processImageSynchronously(): Promise<void> {
		PerformanceTracker.startPhase('sync_processing')

		try {
			const response = await this.fetchResourceResponseJob.handle(this.context.request)
			if (!response || response.status === 404) {
				throw new UnableToFetchResourceException(this.context.request.resourceTarget)
			}

			const contentLength = response.headers['content-length']
			if (contentLength) {
				const sizeBytes = Number.parseInt(contentLength, 10)
				const format = this.getFormatFromUrl(this.context.request.resourceTarget)
				if (!this.inputSanitizationService.validateFileSize(sizeBytes, format)) {
					throw new Error(`File size ${sizeBytes} bytes exceeds limit for format ${format}`)
				}
			}

			await this.storeResourceResponseToFileJob.handle(this.context.request.resourceTarget, this.getResourceTempPath, response)

			let processedData: Buffer
			let metadata!: ResourceMetaData

			let isSourceSvg = false
			try {
				const fileContent = await readFile(this.getResourceTempPath, 'utf8')
				isSourceSvg = fileContent.trim().startsWith('<svg') || fileContent.includes('xmlns="http://www.w3.org/2000/svg"')
				CorrelatedLogger.debug(`Source file SVG detection: ${isSourceSvg}`, CacheImageResourceOperation.name)
			}
			catch {
				isSourceSvg = false
				CorrelatedLogger.debug('Could not read file as text, assuming not SVG', CacheImageResourceOperation.name)
			}

			if (isSourceSvg) {
				const result = await this.processSvgImage()
				processedData = result.data
				metadata = result.metadata
			}
			else {
				const result = await this.processRasterImage()
				processedData = result.data
				metadata = result.metadata
			}

			await this.cacheManager.set('image', this.context.id, {
				data: processedData,
				metadata,
			}, metadata.privateTTL)

			await writeFile(this.getResourcePath, processedData)
			await writeFile(this.getResourceMetaPath, JSON.stringify(metadata), 'utf8')

			try {
				await unlink(this.getResourceTempPath)
			}
			catch (error: unknown) {
				CorrelatedLogger.warn(`Failed to delete temporary file: ${(error as Error).message}`, CacheImageResourceOperation.name)
			}

			const format = metadata.format || 'unknown'
			const duration = PerformanceTracker.endPhase('sync_processing')
			this.metricsService.recordImageProcessing('process', format, 'success', duration || 0)
			CorrelatedLogger.debug(`Image processed successfully: ${this.context.id}`, CacheImageResourceOperation.name)
		}
		catch (error: unknown) {
			const duration = PerformanceTracker.endPhase('sync_processing')
			this.metricsService.recordImageProcessing('process', 'unknown', 'error', duration || 0)
			throw error
		}
	}

	private async processSvgImage(): Promise<{ data: Buffer, metadata: ResourceMetaData }> {
		CorrelatedLogger.debug('Processing SVG format', CacheImageResourceOperation.name)

		const svgContent = await readFile(this.getResourceTempPath, 'utf8')
		if (!svgContent.toLowerCase().includes('<svg')) {
			CorrelatedLogger.warn('The file is not a valid SVG. Serving default WebP image.', CacheImageResourceOperation.name)
			return await this.processDefaultImage()
		}

		const resizeOptions = this.context.request.resizeOptions
		const needsResizing = (resizeOptions?.width !== null && !Number.isNaN(resizeOptions?.width))
			|| (resizeOptions?.height !== null && !Number.isNaN(resizeOptions?.height))

		if (!needsResizing) {
			const data = Buffer.from(svgContent, 'utf8')
			const metadata = new ResourceMetaData({
				version: 1,
				size: data.length.toString(),
				format: 'svg',
				dateCreated: Date.now(),
				publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
				privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
			})

			return { data, metadata }
		}
		else {
			CorrelatedLogger.debug('SVG needs resizing, converting to PNG for better quality', CacheImageResourceOperation.name)
			const result = await this.webpImageManipulationJob.handle(
				this.getResourceTempPath,
				this.getResourcePath,
				resizeOptions,
			)

			const data = await readFile(this.getResourcePath)
			const metadata = new ResourceMetaData({
				version: 1,
				size: result.size,
				format: result.format,
				dateCreated: Date.now(),
				publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
				privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
			})

			return { data, metadata }
		}
	}

	private async processRasterImage(): Promise<{ data: Buffer, metadata: ResourceMetaData }> {
		const result = await this.webpImageManipulationJob.handle(
			this.getResourceTempPath,
			this.getResourcePath,
			this.context.request.resizeOptions,
		)

		CorrelatedLogger.debug(`processRasterImage received result: ${JSON.stringify(result)}`, 'CacheImageResourceOperation')

		const data = await readFile(this.getResourcePath)

		const actualFormat = result.format
		const requestedFormat = this.context.request.resizeOptions?.format

		if (requestedFormat === 'svg' && result.format !== 'svg') {
			CorrelatedLogger.debug(`SVG format requested but actual format is ${result.format}. Using actual format for content-type.`, 'CacheImageResourceOperation')
		}

		const metadata = new ResourceMetaData({
			version: 1,
			size: result.size,
			format: actualFormat,
			dateCreated: Date.now(),
			publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
			privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
		})

		CorrelatedLogger.debug(`processRasterImage created metadata: ${JSON.stringify(metadata)}`, 'CacheImageResourceOperation')

		return { data, metadata }
	}

	private async processDefaultImage(): Promise<{ data: Buffer, metadata: ResourceMetaData }> {
		const optimizedPath = await this.optimizeAndServeDefaultImage(this.context.request.resizeOptions)
		const data = await readFile(optimizedPath)
		const metadata = new ResourceMetaData({
			version: 1,
			size: data.length.toString(),
			format: 'webp',
			dateCreated: Date.now(),
			publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
			privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
		})

		return { data, metadata }
	}

	private getFormatFromUrl(url: string): string {
		const extension = url.split('.').pop()?.toLowerCase()
		return extension || 'unknown'
	}

	public async optimizeAndServeDefaultImage(resizeOptions: ResizeOptions): Promise<string> {
		const resizeOptionsWithDefaults: ResizeOptions = {
			width: resizeOptions.width || 800,
			height: resizeOptions.height || 600,
			fit: resizeOptions.fit || FitOptions.contain,
			position: resizeOptions.position || PositionOptions.entropy,
			format: resizeOptions.format || SupportedResizeFormats.webp,
			background: resizeOptions.background || BackgroundOptions.white,
			trimThreshold: resizeOptions.trimThreshold || 5,
			quality: resizeOptions.quality || 80,
		}

		const optionsString = this.createOptionsString(resizeOptionsWithDefaults)
		const optimizedPath = path.join(this.basePath, 'storage', `default_optimized_${optionsString}.webp`)

		try {
			await access(optimizedPath)
			return optimizedPath
		}
		catch (error: unknown) {
			if ((error as any).code === 'ENOENT') {
				const result = await this.webpImageManipulationJob.handle(
					path.join(this.basePath, 'public', 'default.png'),
					optimizedPath,
					resizeOptionsWithDefaults,
				)

				if (!result) {
					throw new Error('Failed to optimize default image')
				}

				return optimizedPath
			}
			throw error
		}
	}

	private createOptionsString(options: ResizeOptions): string {
		const hash = createHash('md5')
		hash.update(JSON.stringify(options))
		return hash.digest('hex')
	}

	/**
	 * Get cached resource data from multi-layer cache or filesystem
	 */
	public async getCachedResource(): Promise<{ data: Buffer, metadata: ResourceMetaData } | null> {
		PerformanceTracker.startPhase('get_cached_resource')

		try {
			let cachedResource = await this.cacheManager.get<{ data: Buffer, metadata: ResourceMetaData }>('image', this.context.id)

			if (cachedResource && (!cachedResource.metadata || typeof cachedResource.metadata.dateCreated !== 'number')) {
				CorrelatedLogger.warn(`Corrupted cache data found in getCachedResource, deleting: ${this.context.id}`, CacheImageResourceOperation.name)
				await this.cacheManager.delete('image', this.context.id)
				cachedResource = null
			}

			if (!cachedResource) {
				const cachedData = await this.cacheManager.get<string>('images', this.context.id)
				if (cachedData) {
					const metadata = new ResourceMetaData({
						version: 1,
						size: Buffer.from(cachedData, 'base64').length.toString(),
						format: this.context.request.resizeOptions?.format || 'webp',
						dateCreated: Date.now(),
						publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
						privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
					})

					cachedResource = {
						data: Buffer.from(cachedData, 'base64'),
						metadata,
					}
				}
			}

			if (cachedResource) {
				CorrelatedLogger.debug(`Resource retrieved from cache: ${this.context.id}`, CacheImageResourceOperation.name)
				const duration = PerformanceTracker.endPhase('get_cached_resource')
				this.metricsService.recordCacheOperation('get', 'multi-layer', 'hit', duration || 0)
				return cachedResource
			}

			const resourceExists = await access(this.getResourcePath).then(() => true).catch(() => false)
			const metadataExists = await access(this.getResourceMetaPath).then(() => true).catch(() => false)

			if (resourceExists && metadataExists) {
				const data = await readFile(this.getResourcePath)
				const metadataContent = await readFile(this.getResourceMetaPath, 'utf8')
				const metadata = new ResourceMetaData(JSON.parse(metadataContent))

				await this.cacheManager.set('image', this.context.id, { data, metadata }, metadata.privateTTL)

				CorrelatedLogger.debug(`Resource retrieved from filesystem and cached: ${this.context.id}`, CacheImageResourceOperation.name)
				const duration = PerformanceTracker.endPhase('get_cached_resource')
				this.metricsService.recordCacheOperation('get', 'filesystem', 'hit', duration || 0)
				return { data, metadata }
			}

			CorrelatedLogger.debug(`Resource not found: ${this.context.id}`, CacheImageResourceOperation.name)
			const duration = PerformanceTracker.endPhase('get_cached_resource')
			this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss', duration || 0)
			return null
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Failed to get cached resource: ${(error as Error).message}`, (error as Error).stack, CacheImageResourceOperation.name)
			this.metricsService.recordError('cache_retrieval', 'get_cached_resource')
			const duration = PerformanceTracker.endPhase('get_cached_resource')
			this.metricsService.recordCacheOperation('get', 'multi-layer', 'error', duration || 0)
			return null
		}
	}
}
