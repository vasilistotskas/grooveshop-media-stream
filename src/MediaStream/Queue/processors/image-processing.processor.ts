import { Buffer } from 'node:buffer'
import { Injectable, Logger } from '@nestjs/common'
import sharp from 'sharp'
import { MultiLayerCacheManager } from '../../Cache/services/multi-layer-cache.manager'
import { CorrelationService } from '../../Correlation/services/correlation.service'
import { HttpClientService } from '../../HTTP/services/http-client.service'
import { Job } from '../interfaces/job-queue.interface'
import { ImageProcessingJobData, JobResult } from '../types/job.types'

@Injectable()
export class ImageProcessingProcessor {
	private readonly logger = new Logger(ImageProcessingProcessor.name)

	constructor(
		private readonly correlationService: CorrelationService,
		private readonly httpClient: HttpClientService,
		private readonly cacheManager: MultiLayerCacheManager,
	) {}

	async process(job: Job<ImageProcessingJobData>): Promise<JobResult> {
		const startTime = Date.now()
		const { imageUrl, width, height, quality, format, cacheKey } = job.data

		try {
			// Note: Correlation ID is already set in the job data
			// The correlation service doesn't have a setCorrelationId method

			this.logger.debug(`Processing image job ${job.id} for URL: ${imageUrl}`)

			// Check if already cached
			const cached = await this.cacheManager.get('images', cacheKey)
			if (cached) {
				this.logger.debug(`Image already cached for job ${job.id}`)
				return {
					success: true,
					data: cached,
					processingTime: Date.now() - startTime,
					cacheHit: true,
				}
			}

			// Update job progress
			await this.updateProgress(job, 25, 'Downloading image')

			// Download image
			const imageBuffer = await this.downloadImage(imageUrl)

			// Update job progress
			await this.updateProgress(job, 50, 'Processing image')

			// Process image
			const processedBuffer = await this.processImage(imageBuffer, {
				width: width ? Number(width) : undefined,
				height: height ? Number(height) : undefined,
				quality: quality ? Number(quality) : undefined,
				format,
			})

			// Update job progress
			await this.updateProgress(job, 75, 'Caching result')

			// Cache the result
			await this.cacheManager.set('images', cacheKey, processedBuffer.toString('base64'), 3600) // 1 hour TTL

			// Update job progress
			await this.updateProgress(job, 100, 'Completed')

			const processingTime = Date.now() - startTime
			this.logger.debug(`Image processing completed for job ${job.id} in ${processingTime}ms`)

			return {
				success: true,
				data: processedBuffer,
				processingTime,
				cacheHit: false,
			}
		}
		catch (error) {
			const processingTime = Date.now() - startTime
			this.logger.error(`Image processing failed for job ${job.id}:`, error)

			return {
				success: false,
				error: error.message,
				processingTime,
				cacheHit: false,
			}
		}
	}

	private async downloadImage(url: string): Promise<Buffer> {
		try {
			const response = await this.httpClient.get(url, {
				responseType: 'arraybuffer',
				timeout: 30000,
			})

			return Buffer.from(response.data)
		}
		catch (error) {
			this.logger.error(`Failed to download image from ${url}:`, error)
			throw new Error(`Failed to download image: ${error.message}`)
		}
	}

	private async processImage(
		buffer: Buffer,
		options: {
			width?: number
			height?: number
			quality?: number
			format?: string
		},
	): Promise<Buffer> {
		try {
			let pipeline = sharp(buffer)

			// Resize if dimensions specified
			if (options.width || options.height) {
				pipeline = pipeline.resize(options.width, options.height, {
					fit: 'inside',
					withoutEnlargement: true,
				})
			}

			// Convert format and set quality
			switch (options.format) {
				case 'webp':
					pipeline = pipeline.webp({ quality: options.quality || 80 })
					break
				case 'jpeg':
					pipeline = pipeline.jpeg({ quality: options.quality || 80 })
					break
				case 'png':
					pipeline = pipeline.png({ quality: options.quality || 80 })
					break
				default:
					// Keep original format
					break
			}

			return await pipeline.toBuffer()
		}
		catch (error) {
			this.logger.error('Failed to process image:', error)
			throw new Error(`Image processing failed: ${error.message}`)
		}
	}

	private async updateProgress(job: Job, progress: number, message: string): Promise<void> {
		try {
			// Note: This would need to be implemented based on the actual Bull job instance
			// For now, we'll just log the progress
			this.logger.debug(`Job ${job.id} progress: ${progress}% - ${message}`)
		}
		catch (error) {
			this.logger.warn(`Failed to update job progress: ${error.message}`)
		}
	}
}
