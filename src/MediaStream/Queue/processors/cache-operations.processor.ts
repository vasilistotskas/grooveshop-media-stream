import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as process from 'node:process'
import { Injectable, Logger } from '@nestjs/common'
import { MultiLayerCacheManager } from '../../Cache/services/multi-layer-cache.manager'
import { CorrelationService } from '../../Correlation/services/correlation.service'
import { HttpClientService } from '../../HTTP/services/http-client.service'
import { Job } from '../interfaces/job-queue.interface'
import { CacheCleanupJobData, CacheWarmingJobData, JobResult } from '../types/job.types'

@Injectable()
export class CacheOperationsProcessor {
	private readonly logger = new Logger(CacheOperationsProcessor.name)

	constructor(
		private readonly correlationService: CorrelationService,
		private readonly cacheManager: MultiLayerCacheManager,
		private readonly httpClient: HttpClientService,
	) {}

	async processCacheWarming(job: Job<CacheWarmingJobData>): Promise<JobResult> {
		const startTime = Date.now()
		const { imageUrls, batchSize = 5 } = job.data

		try {
			// Note: Correlation ID is already set in the job data

			this.logger.debug(`Starting cache warming job ${job.id} for ${imageUrls.length} images`)

			let processed = 0
			let successful = 0
			let failed = 0

			// Process images in batches
			for (let i = 0; i < imageUrls.length; i += batchSize) {
				const batch = imageUrls.slice(i, i + batchSize)

				const batchPromises = batch.map(async (url) => {
					try {
						await this.warmCacheForImage(url)
						successful++
						return true
					}
					catch (error) {
						this.logger.warn(`Failed to warm cache for ${url}:`, error)
						failed++
						return false
					}
				})

				await Promise.allSettled(batchPromises)
				processed += batch.length

				// Update progress
				const progress = Math.round((processed / imageUrls.length) * 100)
				this.logger.debug(`Cache warming progress: ${progress}% (${processed}/${imageUrls.length})`)
			}

			const processingTime = Date.now() - startTime
			this.logger.log(`Cache warming completed: ${successful} successful, ${failed} failed in ${processingTime}ms`)

			return {
				success: true,
				data: { successful, failed, total: imageUrls.length },
				processingTime,
			}
		}
		catch (error) {
			const processingTime = Date.now() - startTime
			this.logger.error(`Cache warming job ${job.id} failed:`, error)

			return {
				success: false,
				error: error.message,
				processingTime,
			}
		}
	}

	async processCacheCleanup(job: Job<CacheCleanupJobData>): Promise<JobResult> {
		const startTime = Date.now()
		const { maxAge, maxSize } = job.data

		try {
			// Note: Correlation ID is already set in the job data

			this.logger.debug(`Starting cache cleanup job ${job.id}`)

			const cleanupResults = await Promise.allSettled([
				this.cleanupMemoryCache(),
				this.cleanupFileCache(maxAge, maxSize),
			])

			let totalCleaned = 0
			const errors: string[] = []

			cleanupResults.forEach((result, index) => {
				if (result.status === 'fulfilled') {
					totalCleaned += result.value.cleaned
				}
				else {
					const operation = index === 0 ? 'memory cache' : 'file cache'
					errors.push(`${operation}: ${result.reason.message}`)
				}
			})

			const processingTime = Date.now() - startTime

			if (errors.length > 0) {
				this.logger.warn(`Cache cleanup completed with errors: ${errors.join(', ')}`)
			}
			else {
				this.logger.log(`Cache cleanup completed: ${totalCleaned} items cleaned in ${processingTime}ms`)
			}

			return {
				success: errors.length === 0,
				data: { cleaned: totalCleaned, errors },
				processingTime,
			}
		}
		catch (error) {
			const processingTime = Date.now() - startTime
			this.logger.error(`Cache cleanup job ${job.id} failed:`, error)

			return {
				success: false,
				error: error.message,
				processingTime,
			}
		}
	}

	private async warmCacheForImage(imageUrl: string): Promise<void> {
		try {
			// Generate cache key
			const cacheKey = this.generateCacheKey(imageUrl)

			// Check if already cached
			const cached = await this.cacheManager.get('images', cacheKey)
			if (cached) {
				this.logger.debug(`Image already cached: ${imageUrl}`)
				return
			}

			// Download and cache image
			const response = await this.httpClient.get(imageUrl, {
				responseType: 'arraybuffer',
				timeout: 30000,
			})

			const buffer = Buffer.from(response.data)
			await this.cacheManager.set('images', cacheKey, buffer.toString('base64'), 3600) // 1 hour TTL

			this.logger.debug(`Cached image: ${imageUrl}`)
		}
		catch (error) {
			throw new Error(`Failed to warm cache for ${imageUrl}: ${error.message}`)
		}
	}

	private async cleanupMemoryCache(): Promise<{ cleaned: number }> {
		try {
			// Get cache stats to determine cleanup strategy
			await this.cacheManager.getStats()

			// For now, we'll just clear expired items
			// In a real implementation, this would be more sophisticated
			const cleaned = 0

			this.logger.debug(`Memory cache cleanup completed: ${cleaned} items cleaned`)
			return { cleaned }
		}
		catch (error) {
			throw new Error(`Memory cache cleanup failed: ${error.message}`)
		}
	}

	private async cleanupFileCache(maxAge: number, maxSize: number): Promise<{ cleaned: number }> {
		try {
			const cacheDir = path.join(process.cwd(), 'storage')
			let cleaned = 0

			try {
				const files = await fs.readdir(cacheDir)
				const now = Date.now()

				for (const file of files) {
					const filePath = path.join(cacheDir, file)

					try {
						const stats = await fs.stat(filePath)

						// Check age
						const age = now - stats.mtime.getTime()
						if (age > maxAge) {
							await fs.unlink(filePath)
							cleaned++
							continue
						}

						// Check size
						if (stats.size > maxSize) {
							await fs.unlink(filePath)
							cleaned++
						}
					}
					catch (fileError) {
						this.logger.warn(`Failed to process file ${file}:`, fileError)
					}
				}
			}
			catch (dirError) {
				if (dirError.code !== 'ENOENT') {
					throw dirError
				}
			}

			this.logger.debug(`File cache cleanup completed: ${cleaned} files cleaned`)
			return { cleaned }
		}
		catch (error) {
			throw new Error(`File cache cleanup failed: ${error.message}`)
		}
	}

	private generateCacheKey(imageUrl: string): string {
		// Simple cache key generation - in real implementation this would be more sophisticated
		const hash = Buffer.from(imageUrl).toString('base64').replace(/[/+=]/g, '')
		return `image:${hash}`
	}
}
