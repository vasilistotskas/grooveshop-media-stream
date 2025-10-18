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
import { Injectable, InternalServerErrorException, Scope } from '@nestjs/common'
import { MultiLayerCacheManager } from '../services/multi-layer-cache.manager.js'

@Injectable({ scope: Scope.REQUEST })
export default class CacheImageResourceOperation {
	private readonly basePath = cwd()

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

	request!: CacheImageRequest

	id!: ResourceIdentifierKP

	metaData!: ResourceMetaData

	get getResourcePath(): string {
		return path.join(this.basePath, 'storage', `${this.id}.rsc`)
	}

	get getResourceTempPath(): string {
		return path.join(this.basePath, 'storage', `${this.id}.rst`)
	}

	get getResourceMetaPath(): string {
		return path.join(this.basePath, 'storage', `${this.id}.rsm`)
	}

	get resourceExists(): Promise<boolean> {
		return (async () => {
			PerformanceTracker.startPhase('resource_exists_check')

			try {
				CorrelatedLogger.debug(`Checking if resource exists in cache: ${this.id}`, CacheImageResourceOperation.name)

				const cachedResource = await this.cacheManager.get<{ data: Buffer, metadata: ResourceMetaData }>('image', this.id)
				if (cachedResource) {
					if (!cachedResource.metadata || typeof cachedResource.metadata.dateCreated !== 'number') {
						CorrelatedLogger.warn(`Corrupted cache data found, deleting: ${this.id}`, CacheImageResourceOperation.name)
						await this.cacheManager.delete('image', this.id)
					}
					else {
						const isValid = cachedResource.metadata.dateCreated + cachedResource.metadata.privateTTL > Date.now()
						if (isValid) {
							CorrelatedLogger.debug(`Resource found in cache and is valid: ${this.id}`, CacheImageResourceOperation.name)
							const duration = PerformanceTracker.endPhase('resource_exists_check')
							this.metricsService.recordCacheOperation('get', 'multi-layer', 'hit', duration || 0)
							return true
						}
						else {
							CorrelatedLogger.debug(`Resource found in cache but expired: ${this.id}`, CacheImageResourceOperation.name)
							await this.cacheManager.delete('image', this.id)
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

				const headers = await this.getHeaders

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
		})()
	}

	get getHeaders(): Promise<ResourceMetaData> {
		return (async (): Promise<ResourceMetaData> => {
			if (!this.metaData) {
				try {
					const cachedResource = await this.getCachedResource()
					if (cachedResource && cachedResource.metadata) {
						this.metaData = cachedResource.metadata
						return this.metaData
					}

					const exists = await access(this.getResourceMetaPath).then(() => true).catch(() => false)
					if (exists) {
						const content = await readFile(this.getResourceMetaPath, 'utf8')
						this.metaData = new ResourceMetaData(JSON.parse(content))
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
			return this.metaData
		})()
	}

	public async setup(cacheImageRequest: CacheImageRequest): Promise<void> {
		PerformanceTracker.startPhase('setup')

		try {
			CorrelatedLogger.debug('Setting up cache image resource operation', CacheImageResourceOperation.name)

			this.request = await this.inputSanitizationService.sanitize(cacheImageRequest) as CacheImageRequest

			if (this.request.resourceTarget && !this.inputSanitizationService.validateUrl(this.request.resourceTarget)) {
				throw new Error(`Invalid or disallowed URL: ${this.request.resourceTarget}`)
			}

			if (this.request.resizeOptions?.width && this.request.resizeOptions?.height) {
				if (!this.inputSanitizationService.validateImageDimensions(this.request.resizeOptions.width, this.request.resizeOptions.height)) {
					throw new Error(`Invalid image dimensions: ${this.request.resizeOptions.width}x${this.request.resizeOptions.height}`)
				}
			}

			await this.validateCacheImageRequest.setup(this.request)
			await this.validateCacheImageRequest.apply()

			this.id = await this.generateResourceIdentityFromRequestJob.handle(this.request)
			this.metaData = null as any

			CorrelatedLogger.debug(`Resource ID generated: ${this.id}`, CacheImageResourceOperation.name)
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

			if (await this.resourceExists) {
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
		const resizeOptions = this.request.resizeOptions
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
		const priority = this.request.resizeOptions?.width && this.request.resizeOptions.width > 1920
			? JobPriority.LOW
			: JobPriority.NORMAL

		await this.jobQueueManager.addImageProcessingJob({
			imageUrl: this.request.resourceTarget,
			width: this.request.resizeOptions?.width ?? undefined,
			height: this.request.resizeOptions?.height ?? undefined,
			quality: this.request.resizeOptions?.quality,
			format: this.request.resizeOptions?.format as 'webp' | 'jpeg' | 'png',
			fit: this.request.resizeOptions?.fit,
			position: this.request.resizeOptions?.position,
			background: this.request.resizeOptions?.background,
			trimThreshold: this.request.resizeOptions?.trimThreshold ?? undefined,
			cacheKey: this.id,
			priority,
		})

		CorrelatedLogger.debug(`Image processing job queued with priority: ${priority}`, CacheImageResourceOperation.name)
	}

	private async processImageSynchronously(): Promise<void> {
		PerformanceTracker.startPhase('sync_processing')

		try {
			const response = await this.fetchResourceResponseJob.handle(this.request)
			if (!response || response.status === 404) {
				throw new UnableToFetchResourceException(this.request.resourceTarget)
			}

			const contentLength = response.headers['content-length']
			if (contentLength) {
				const sizeBytes = Number.parseInt(contentLength, 10)
				const format = this.getFormatFromUrl(this.request.resourceTarget)
				if (!this.inputSanitizationService.validateFileSize(sizeBytes, format)) {
					throw new Error(`File size ${sizeBytes} bytes exceeds limit for format ${format}`)
				}
			}

			await this.storeResourceResponseToFileJob.handle(this.request.resourceTarget, this.getResourceTempPath, response)

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

			await this.cacheManager.set('image', this.id, {
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
			CorrelatedLogger.debug(`Image processed successfully: ${this.id}`, CacheImageResourceOperation.name)
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

		const needsResizing = (this.request.resizeOptions?.width !== null && !Number.isNaN(this.request.resizeOptions?.width))
			|| (this.request.resizeOptions?.height !== null && !Number.isNaN(this.request.resizeOptions?.height))

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
				this.request.resizeOptions,
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
			this.request.resizeOptions,
		)

		CorrelatedLogger.debug(`processRasterImage received result: ${JSON.stringify(result)}`, 'CacheImageResourceOperation')

		const data = await readFile(this.getResourcePath)

		const actualFormat = result.format
		const requestedFormat = this.request.resizeOptions?.format

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
		const optimizedPath = await this.optimizeAndServeDefaultImage(this.request.resizeOptions)
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
			let cachedResource = await this.cacheManager.get<{ data: Buffer, metadata: ResourceMetaData }>('image', this.id)

			if (cachedResource && (!cachedResource.metadata || typeof cachedResource.metadata.dateCreated !== 'number')) {
				CorrelatedLogger.warn(`Corrupted cache data found in getCachedResource, deleting: ${this.id}`, CacheImageResourceOperation.name)
				await this.cacheManager.delete('image', this.id)
				cachedResource = null
			}

			if (!cachedResource) {
				const cachedData = await this.cacheManager.get<string>('images', this.id)
				if (cachedData) {
					const metadata = new ResourceMetaData({
						version: 1,
						size: Buffer.from(cachedData, 'base64').length.toString(),
						format: this.request.resizeOptions?.format || 'webp',
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
				CorrelatedLogger.debug(`Resource retrieved from cache: ${this.id}`, CacheImageResourceOperation.name)
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

				await this.cacheManager.set('image', this.id, { data, metadata }, metadata.privateTTL)

				CorrelatedLogger.debug(`Resource retrieved from filesystem and cached: ${this.id}`, CacheImageResourceOperation.name)
				const duration = PerformanceTracker.endPhase('get_cached_resource')
				this.metricsService.recordCacheOperation('get', 'filesystem', 'hit', duration || 0)
				return { data, metadata }
			}

			CorrelatedLogger.debug(`Resource not found: ${this.id}`, CacheImageResourceOperation.name)
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
