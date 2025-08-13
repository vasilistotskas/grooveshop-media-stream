import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as process from 'node:process'
import { MultiLayerCacheManager } from '@microservice/Cache/services/multi-layer-cache.manager'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { HttpClientService } from '@microservice/HTTP/services/http-client.service'
import { Injectable, Logger } from '@nestjs/common'
import { Job } from '../interfaces/job-queue.interface'
import { CacheCleanupJobData, CacheWarmingJobData, JobResult } from '../types/job.types'

@Injectable()
export class CacheOperationsProcessor {
	private readonly _logger = new Logger(CacheOperationsProcessor.name)

	constructor(
		private readonly _correlationService: CorrelationService,
		private readonly cacheManager: MultiLayerCacheManager,
		private readonly httpClient: HttpClientService,
	) {}

	async processCacheWarming(job: Job<CacheWarmingJobData>): Promise<JobResult> {
		const startTime = Date.now()
		const { imageUrls, batchSize = 5, correlationId } = job.data

		return this._correlationService.runWithContext(
			{
				correlationId,
				timestamp: Date.now(),
				clientIp: 'queue-worker',
				method: 'JOB',
				url: `/queue/cache-warming/${job.id}`,
				startTime: process.hrtime.bigint(),
			},
			async () => {
				try {
					this._logger.debug(`Starting cache warming job ${job.id} for ${imageUrls.length} images`)

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
							catch (error: unknown) {
								this._logger.warn(`Failed to warm cache for ${url}:`, error)
								failed++
								return false
							}
						})

						await Promise.allSettled(batchPromises)
						processed += batch.length

						// Update progress
						const progress = Math.round((processed / imageUrls.length) * 100)
						this._logger.debug(`Cache warming progress: ${progress}% (${processed}/${imageUrls.length})`)
					}

					const processingTime = Date.now() - startTime
					this._logger.log(`Cache warming completed: ${successful} successful, ${failed} failed in ${processingTime}ms`)

					return {
						success: true,
						data: { successful, failed, total: imageUrls.length },
						processingTime,
					}
				}
				catch (error: unknown) {
					const processingTime = Date.now() - startTime
					this._logger.error(`Cache warming job ${job.id} failed:`, error)

					return {
						success: false,
						error: (error as Error).message,
						processingTime,
					}
				}
			},
		)
	}

	async processCacheCleanup(job: Job<CacheCleanupJobData>): Promise<JobResult> {
		const startTime = Date.now()
		const { maxAge, maxSize, correlationId } = job.data

		return this._correlationService.runWithContext(
			{
				correlationId,
				timestamp: Date.now(),
				clientIp: 'queue-worker',
				method: 'JOB',
				url: `/queue/cache-cleanup/${job.id}`,
				startTime: process.hrtime.bigint(),
			},
			async () => {
				try {
					this._logger.debug(`Starting cache cleanup job ${job.id}`)

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
						this._logger.warn(`Cache cleanup completed with errors: ${errors.join(', ')}`)
					}
					else {
						this._logger.log(`Cache cleanup completed: ${totalCleaned} items cleaned in ${processingTime}ms`)
					}

					return {
						success: errors.length === 0,
						data: { cleaned: totalCleaned, errors },
						processingTime,
					}
				}
				catch (error: unknown) {
					const processingTime = Date.now() - startTime
					this._logger.error(`Cache cleanup job ${job.id} failed:`, error)

					return {
						success: false,
						error: (error as Error).message,
						processingTime,
					}
				}
			},
		)
	}

	private async warmCacheForImage(imageUrl: string): Promise<void> {
		try {
			// Generate cache key
			const cacheKey = this.generateCacheKey(imageUrl)

			// Check if already cached
			const cached = await this.cacheManager.get('images', cacheKey)
			if (cached) {
				this._logger.debug(`Image already cached: ${imageUrl}`)
				return
			}

			// Download and cache image
			const response = await this.httpClient.get(imageUrl, {
				responseType: 'arraybuffer',
				timeout: 30000,
			})

			const buffer = Buffer.from(response.data)
			await this.cacheManager.set('images', cacheKey, buffer.toString('base64'), 3600) // 1 hour TTL

			this._logger.debug(`Cached image: ${imageUrl}`)
		}
		catch (error: unknown) {
			throw new Error(`Failed to warm cache for ${imageUrl}: ${(error as Error).message}`)
		}
	}

	private async cleanupMemoryCache(): Promise<{ cleaned: number }> {
		try {
			// Get cache stats to determine cleanup strategy
			await this.cacheManager.getStats()

			// For now, we'll just clear expired items
			// In a real implementation, this would be more sophisticated
			const cleaned = 0

			this._logger.debug(`Memory cache cleanup completed: ${cleaned} items cleaned`)
			return { cleaned }
		}
		catch (error: unknown) {
			throw new Error(`Memory cache cleanup failed: ${(error as Error).message}`)
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
						this._logger.warn(`Failed to process file ${file}:`, fileError)
					}
				}
			}
			catch (dirError) {
				if ((dirError as any).code !== 'ENOENT') {
					throw dirError
				}
			}

			this._logger.debug(`File cache cleanup completed: ${cleaned} files cleaned`)
			return { cleaned }
		}
		catch (error: unknown) {
			throw new Error(`File cache cleanup failed: ${(error as Error).message}`)
		}
	}

	private generateCacheKey(imageUrl: string): string {
		// Simple cache key generation - in real implementation this would be more sophisticated
		const hash = Buffer.from(imageUrl).toString('base64').replace(/[/+=]/g, '')
		return `image:${hash}`
	}
}
