import type { Job } from '../interfaces/job-queue.interface.js'
import type { ImageProcessingJobData, JobResult } from '../types/job.types.js'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd, hrtime } from 'node:process'
import { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { MAX_FILE_SIZES } from '#microservice/common/constants/image-limits.constant'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { HttpClientService } from '#microservice/HTTP/services/http-client.service'
import WebpImageManipulationJob from '#microservice/Queue/jobs/webp-image-manipulation.job'
import { Injectable, Logger } from '@nestjs/common'

/**
 * Processes image jobs from the queue.
 * Delegates Sharp processing to WebpImageManipulationJob for consistent
 * format settings across sync and queue pipelines.
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
		private readonly imageManipulationJob: WebpImageManipulationJob,
	) {
		// Load TTL values from configuration (in seconds — cache layers expect seconds)
		this.publicTtl = this.configService.getOptional('cache.image.publicTtl', 12 * 30 * 24 * 3600)
		this.privateTtl = this.configService.getOptional('cache.image.privateTtl', 6 * 30 * 24 * 3600)
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
				// No try/catch here — errors bubble up to Bull's processor wrapper,
				// which handles retry scheduling and backoff. Catching here and
				// returning { success: false } would mark the job as succeeded in
				// Bull's eyes and skip all configured retry attempts.
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
						cacheKey: `image:${cacheKey}`,
						processingTime: Date.now() - startTime,
						cacheHit: true,
					}
				}

				await this.updateProgress(job, 25, 'Downloading image')

				const imageBuffer = await this.downloadImage(imageUrl)

				await this.updateProgress(job, 50, 'Processing image')

				const resizeOptions = new ResizeOptions({
					width: width ? Number(width) : undefined,
					height: height ? Number(height) : undefined,
					quality: quality ? Number(quality) : undefined,
					format: format as any,
					fit: fit as any,
					position: position as any,
					background: background as any,
					trimThreshold: trimThreshold ? Number(trimThreshold) : undefined,
				})

				const result = await this.imageManipulationJob.handleBuffer(imageBuffer, resizeOptions)
				const processedBuffer = result.buffer

				await this.updateProgress(job, 75, 'Caching result')

				const metadata = new ResourceMetaData({
					version: 1,
					size: processedBuffer.length.toString(),
					format: result.format || 'webp',
					dateCreated: Date.now(),
					publicTTL: this.publicTtl * 1000,
					privateTTL: this.privateTtl * 1000,
				})

				await this.cacheManager.set('image', cacheKey, {
					data: processedBuffer,
					metadata,
				}, this.privateTtl)

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
					// Filesystem write is best-effort: the image is already in the
					// multi-layer cache above. Log the failure but do not rethrow —
					// a missing .rsc file is recoverable; a failed job that retries
					// would re-download and re-process unnecessarily.
					this._logger.warn(`Failed to save to filesystem: ${(fsError as Error).message}`)
				}

				await this.updateProgress(job, 100, 'Completed')

				const processingTime = Date.now() - startTime
				this._logger.debug(`Image processing completed for job ${job.id} in ${processingTime}ms`)

				// Return a lightweight reference only — the processed buffer is
				// already stored in the cache and on disk above. Consumers must
				// read the result via MultiLayerCacheManager using `cacheKey`
				// rather than reading it from the job's returnvalue, which would
				// serialise the entire image buffer through Redis twice.
				return {
					success: true,
					cacheKey: `image:${cacheKey}`,
					processingTime,
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
			// Skip HEAD request for localhost/internal services (returns malformed HTTP response)
			// Go straight to GET with size limits
			const backendUrl = this.configService.getOptional('BACKEND_URL', '')
			const isInternalUrl = url.includes('localhost')
				|| url.includes('127.0.0.1')
				|| (backendUrl !== '' && url.startsWith(backendUrl))
			const skipHead = isInternalUrl

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

	private async updateProgress(job: Job, progress: number, message: string): Promise<void> {
		try {
			this._logger.debug(`Job ${job.id} progress: ${progress}% - ${message}`)
		}
		catch (error: unknown) {
			this._logger.warn(`Failed to update job progress: ${(error as Error).message}`)
		}
	}
}
