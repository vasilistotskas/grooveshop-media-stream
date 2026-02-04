import type { Job } from '../interfaces/job-queue.interface.js'
import type { ImageProcessingJobData, JobResult } from '../types/job.types.js'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd, hrtime } from 'node:process'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { MAX_FILE_SIZES } from '#microservice/common/constants/image-limits.constant'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { HttpClientService } from '#microservice/HTTP/services/http-client.service'
import { Injectable, Logger } from '@nestjs/common'
import sharp from 'sharp'

/**
 * Processes image jobs from the queue.
 *
 * NOTE: Sharp configuration is now centralized in SharpConfigService.
 * This ensures consistent settings across all image processing operations.
 */
@Injectable()
export class ImageProcessingProcessor {
	private readonly _logger = new Logger(ImageProcessingProcessor.name)
	private static readonly MAX_FILE_SIZE = MAX_FILE_SIZES.default // 10MB default

	// Configurable TTL values (loaded from config)
	private readonly publicTtl: number
	private readonly privateTtl: number

	constructor(
		private readonly _correlationService: CorrelationService,
		private readonly httpClient: HttpClientService,
		private readonly cacheManager: MultiLayerCacheManager,
		private readonly configService: ConfigService,
	) {
		// Load TTL values from configuration
		this.publicTtl = this.configService.getOptional('cache.image.publicTtl', 12 * 30 * 24 * 60 * 60 * 1000)
		this.privateTtl = this.configService.getOptional('cache.image.privateTtl', 6 * 30 * 24 * 60 * 60 * 1000)

		// Sharp configuration is now handled by SharpConfigService
		// This ensures consistent settings across all image processing operations
	}

	async process(job: Job<ImageProcessingJobData>): Promise<JobResult> {
		const startTime = Date.now()
		const { imageUrl, width, height, quality, format, cacheKey, correlationId, fit, position, background, trimThreshold } = job.data

		return this._correlationService.runWithContext(
			{
				correlationId,
				timestamp: Date.now(),
				clientIp: 'queue-worker',
				method: 'JOB',
				url: `/queue/image-processing/${job.id}`,
				startTime: hrtime.bigint(),
			},
			async () => {
				try {
					this._logger.debug(`Processing image job ${job.id} for URL: ${imageUrl} with options:`, {
						width,
						height,
						quality,
						format,
						fit,
						position,
						background,
						trimThreshold,
					})

					const cached = await this.cacheManager.get('image', cacheKey)
					if (cached) {
						this._logger.debug(`Image already cached for job ${job.id}`)
						return {
							success: true,
							data: cached,
							processingTime: Date.now() - startTime,
							cacheHit: true,
						}
					}

					await this.updateProgress(job, 25, 'Downloading image')

					const imageBuffer = await this.downloadImage(imageUrl)

					await this.updateProgress(job, 50, 'Processing image')

					const processedBuffer = await this.processImage(imageBuffer, {
						width: width ? Number(width) : undefined,
						height: height ? Number(height) : undefined,
						quality: quality ? Number(quality) : undefined,
						format,
						fit,
						position,
						background,
						trimThreshold: trimThreshold ? Number(trimThreshold) : undefined,
					})

					await this.updateProgress(job, 75, 'Caching result')

					const metadata = new ResourceMetaData({
						version: 1,
						size: processedBuffer.length.toString(),
						format: format || 'webp',
						dateCreated: Date.now(),
						publicTTL: this.publicTtl,
						privateTTL: this.privateTtl,
					})

					await this.cacheManager.set('image', cacheKey, {
						data: processedBuffer,
						metadata,
					}, metadata.privateTTL)

					const basePath = cwd()
					const resourcePath = join(basePath, 'storage', `${cacheKey}.rsc`)
					const metadataPath = join(basePath, 'storage', `${cacheKey}.rsm`)

					try {
						await Promise.all([
							writeFile(resourcePath, processedBuffer),
							writeFile(metadataPath, JSON.stringify(metadata), 'utf8'),
						])
						this._logger.debug(`Saved processed image to filesystem: ${resourcePath}`)
					}
					catch (fsError) {
						this._logger.warn(`Failed to save to filesystem: ${(fsError as Error).message}`)
					}

					await this.updateProgress(job, 100, 'Completed')

					const processingTime = Date.now() - startTime
					this._logger.debug(`Image processing completed for job ${job.id} in ${processingTime}ms`)

					return {
						success: true,
						data: processedBuffer,
						processingTime,
						cacheHit: false,
					}
				}
				catch (error: unknown) {
					const processingTime = Date.now() - startTime
					this._logger.error(`Image processing failed for job ${job.id}:`, error)

					return {
						success: false,
						error: (error as Error).message,
						processingTime,
						cacheHit: false,
					}
				}
			},
		)
	}

	/**
	 * Download image with Content-Length validation
	 * Prevents memory exhaustion from oversized files
	 */
	private async downloadImage(url: string): Promise<Buffer> {
		try {
			// Skip HEAD request for localhost/Django (returns malformed HTTP response)
			// Go straight to GET with size limits
			const skipHead = url.includes('localhost') || url.includes('127.0.0.1')

			if (!skipHead) {
				// For external URLs, try HEAD request for size validation
				try {
					const headResponse = await this.httpClient.head(url, { timeout: 5000 })
					const contentLength = headResponse.headers['content-length']

					if (contentLength) {
						const size = Number.parseInt(contentLength, 10)
						if (size > ImageProcessingProcessor.MAX_FILE_SIZE) {
							throw new Error(`Image too large: ${size} bytes exceeds maximum ${ImageProcessingProcessor.MAX_FILE_SIZE} bytes`)
						}
						this._logger.debug(`Content-Length validated: ${size} bytes`)
					}
				}
				catch (headError: unknown) {
					// HEAD request failed, continue with GET but with size limit
					this._logger.debug(`HEAD request failed, proceeding with size-limited GET: ${(headError as Error).message}`)
				}
			}

			// Download the image
			const response = await this.httpClient.get(url, {
				responseType: 'arraybuffer',
				timeout: 30000,
				maxContentLength: ImageProcessingProcessor.MAX_FILE_SIZE,
				maxBodyLength: ImageProcessingProcessor.MAX_FILE_SIZE,
			})

			// Validate Content-Type
			const contentType = response.headers['content-type'] || ''
			const allowedTypes = ['image/', 'application/octet-stream']
			if (!allowedTypes.some(type => contentType.startsWith(type))) {
				throw new Error(`Invalid content type: ${contentType}. Expected image/*`)
			}

			const buffer = Buffer.from(response.data)

			// Final size check
			if (buffer.length > ImageProcessingProcessor.MAX_FILE_SIZE) {
				throw new Error(`Downloaded image too large: ${buffer.length} bytes`)
			}

			return buffer
		}
		catch (error: unknown) {
			this._logger.error(`Failed to download image from ${url}:`, error)
			throw new Error(`Failed to download image: ${(error as Error).message}`)
		}
	}

	/**
	 * Process image with proper memory management
	 * Uses Sharp's built-in memory management instead of manual GC
	 */
	private async processImage(
		buffer: Buffer,
		options: {
			width?: number
			height?: number
			quality?: number
			format?: string
			fit?: string
			position?: string
			background?: any
			trimThreshold?: number
		},
	): Promise<Buffer> {
		let pipeline: sharp.Sharp | null = null
		try {
			// Create pipeline with memory limit
			pipeline = sharp(buffer, {
				limitInputPixels: 268402689, // ~16K x 16K pixels max
				sequentialRead: true, // Better memory usage for large images
			})

			if (options.trimThreshold !== undefined && options.trimThreshold > 0) {
				pipeline = pipeline.trim({
					background: options.background,
					threshold: options.trimThreshold,
				})
			}

			if (options.width || options.height) {
				const resizeOptions: any = {}

				if (options.width)
					resizeOptions.width = options.width
				if (options.height)
					resizeOptions.height = options.height
				if (options.fit)
					resizeOptions.fit = options.fit
				if (options.position)
					resizeOptions.position = options.position
				if (options.background)
					resizeOptions.background = options.background

				this._logger.debug('Applying Sharp resize with options:', resizeOptions)
				pipeline = pipeline.resize(resizeOptions)
			}

			const qual = options.quality || 80

			switch (options.format) {
				case 'webp':
					pipeline = pipeline.webp({
						quality: qual,
						smartSubsample: true,
						effort: 4, // Balance between speed and compression
					})
					break
				case 'jpeg':
				case 'jpg':
					pipeline = pipeline.jpeg({
						quality: qual,
						progressive: true,
						mozjpeg: true,
						trellisQuantisation: true,
						overshootDeringing: true,
					})
					break
				case 'png':
					pipeline = pipeline.png({
						quality: qual,
						adaptiveFiltering: true,
						palette: qual < 95,
						compressionLevel: 6, // Balance between speed and size
					})
					break
				case 'avif':
					// AVIF quality capped at 75 for performance
					pipeline = pipeline.avif({
						quality: Math.min(qual, 75),
						chromaSubsampling: '4:2:0',
						effort: 4, // Balance between speed and compression
					})
					break
				default:
					pipeline = pipeline.webp({
						quality: qual,
						smartSubsample: true,
					})
					break
			}

			// Process and get result
			const result = await pipeline
				.withMetadata({ density: 72 })
				.toBuffer()

			return result
		}
		finally {
			// Always destroy pipeline to free memory
			if (pipeline) {
				try {
					pipeline.destroy()
				}
				catch {
					// Ignore destroy errors
				}
			}
		}
	}

	private async updateProgress(job: Job, progress: number, message: string): Promise<void> {
		try {
			// Note: This would need to be implemented based on the actual Bull job instance
			// For now, we'll just log the progress
			this._logger.debug(`Job ${job.id} progress: ${progress}% - ${message}`)
		}
		catch (error: unknown) {
			this._logger.warn(`Failed to update job progress: ${(error as Error).message}`)
		}
	}
}
