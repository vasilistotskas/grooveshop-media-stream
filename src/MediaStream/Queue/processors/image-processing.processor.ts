import { Buffer } from 'node:buffer'
import { hrtime } from 'node:process'
import { MultiLayerCacheManager } from '@microservice/Cache/services/multi-layer-cache.manager'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { HttpClientService } from '@microservice/HTTP/services/http-client.service'
import { Injectable, Logger } from '@nestjs/common'
import sharp from 'sharp'
import { Job } from '../interfaces/job-queue.interface'
import { ImageProcessingJobData, JobResult } from '../types/job.types'

@Injectable()
export class ImageProcessingProcessor {
	private readonly _logger = new Logger(ImageProcessingProcessor.name)

	constructor(
		private readonly _correlationService: CorrelationService,
		private readonly httpClient: HttpClientService,
		private readonly cacheManager: MultiLayerCacheManager,
	) {}

	async process(job: Job<ImageProcessingJobData>): Promise<JobResult> {
		const startTime = Date.now()
		const { imageUrl, width, height, quality, format, cacheKey, correlationId } = job.data

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
					this._logger.debug(`Processing image job ${job.id} for URL: ${imageUrl}`)

					const cached = await this.cacheManager.get('images', cacheKey)
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
					})

					await this.updateProgress(job, 75, 'Caching result')

					await this.cacheManager.set('images', cacheKey, processedBuffer.toString('base64'), 3600)

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

	private async downloadImage(url: string): Promise<Buffer> {
		try {
			const response = await this.httpClient.get(url, {
				responseType: 'arraybuffer',
				timeout: 30000,
			})

			return Buffer.from(response.data)
		}
		catch (error: unknown) {
			this._logger.error(`Failed to download image from ${url}:`, error)
			throw new Error(`Failed to download image: ${(error as Error).message}`)
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

			if (options.width || options.height) {
				pipeline = pipeline.resize(options.width, options.height, {
					fit: 'inside',
					withoutEnlargement: true,
				})
			}

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
					break
			}

			return await pipeline.toBuffer()
		}
		catch (error: unknown) {
			this._logger.error('Failed to process image:', error)
			throw new Error(`Image processing failed: ${(error as Error).message}`)
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
