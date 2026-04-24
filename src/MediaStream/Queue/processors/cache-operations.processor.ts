import type { Job } from '../interfaces/job-queue.interface.js'
import type { CacheCleanupJobData, CacheWarmingJobData, JobResult } from '../types/job.types.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as process from 'node:process'
import CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import { HttpClientService } from '#microservice/HTTP/services/http-client.service'
import { Injectable, Logger } from '@nestjs/common'

const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'
const DASH_RE = /-/g

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
						this.cleanupFileCache(maxAge, maxSize),
					])

					let totalCleaned = 0
					const errors: string[] = []

					cleanupResults.forEach((result, index) => {
						if (result.status === 'fulfilled') {
							totalCleaned += result.value.cleaned
						}
						else {
							const operation = index === 0 ? 'file cache' : 'unknown'
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
			const request = new CacheImageRequest({ resourceTarget: imageUrl })
			const cacheKey = this.generateCacheKey(request)

			const cached = await this.cacheManager.get('image', cacheKey)
			if (cached) {
				this._logger.debug(`Image already cached: ${imageUrl}`)
				return
			}

			const response = await this.httpClient.get(imageUrl, {
				responseType: 'arraybuffer',
				timeout: 30000,
			})

			const buffer = Buffer.from(response.data)
			await this.cacheManager.set('image', cacheKey, { data: buffer }, 3600)

			this._logger.debug(`Cached image: ${imageUrl}`)
		}
		catch (error: unknown) {
			throw new Error(`Failed to warm cache for ${imageUrl}: ${(error as Error).message}`)
		}
	}

	private async cleanupFileCache(maxAge: number, maxSize: number): Promise<{ cleaned: number }> {
		try {
			const cacheDir = path.join(process.cwd(), 'storage')
			let cleaned = 0

			try {
				const files = await fs.readdir(cacheDir)
				const now = Date.now()
				const BATCH_SIZE = 50

				for (let i = 0; i < files.length; i += BATCH_SIZE) {
					const batch = files.slice(i, i + BATCH_SIZE)

					const results = await Promise.allSettled(
						batch.map(async (file) => {
							const filePath = path.join(cacheDir, file)
							const stats = await fs.stat(filePath)
							return { filePath, stats }
						}),
					)

					const toDelete: string[] = []
					for (const result of results) {
						if (result.status !== 'fulfilled')
							continue
						const { filePath, stats } = result.value
						const age = now - stats.mtime.getTime()
						if (age > maxAge || stats.size > maxSize) {
							toDelete.push(filePath)
						}
					}

					const deleteResults = await Promise.allSettled(
						toDelete.map(filePath => fs.unlink(filePath)),
					)

					for (const result of deleteResults) {
						if (result.status === 'fulfilled') {
							cleaned++
						}
						else {
							this._logger.warn(`Failed to delete file:`, result.reason)
						}
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

	/**
	 * Generates a UUID-v5 cache key from a CacheImageRequest, matching the
	 * identity produced by GenerateResourceIdentityFromRequestJob on the sync path.
	 */
	private generateCacheKey(request: CacheImageRequest): string {
		const requestStr = JSON.stringify(JSON.parse(JSON.stringify(request)))
		const ns = Buffer.from(NAMESPACE_URL.replace(DASH_RE, ''), 'hex')
		const hash = createHash('sha1').update(Buffer.concat([ns, Buffer.from(requestStr)])).digest()

		hash[6] = (hash[6] & 0x0F) | 0x50
		hash[8] = (hash[8] & 0x3F) | 0x80

		const hex = hash.subarray(0, 16).toString('hex')
		return (
			`${hex.substring(0, 8)}-`
			+ `${hex.substring(8, 12)}-`
			+ `${hex.substring(12, 16)}-`
			+ `${hex.substring(16, 20)}-`
			+ `${hex.substring(20)}`
		)
	}
}
