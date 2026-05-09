import type { OnModuleInit } from '@nestjs/common'
import { Buffer } from 'node:buffer'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Injectable } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'
import { MultiLayerCacheManager } from './multi-layer-cache.manager.js'

const FILE_EXTENSION_RE = /\.[^/.]+$/

interface CacheWarmingConfig {
	enabled: boolean
	warmupOnStart: boolean
	maxFilesToWarm: number
	warmupCron: string
	popularImageThreshold: number
}

interface FileAccessInfo {
	path: string
	lastAccessed: Date
	accessCount: number
	size: number
}

@Injectable()
export class CacheWarmingService implements OnModuleInit {
	private readonly config: CacheWarmingConfig
	private readonly storagePath: string
	private readonly baseCacheTtl: number
	private lastWarmup: Date | null = null
	private lastFilesWarmed = 0

	constructor(
		private readonly cacheManager: MultiLayerCacheManager,
		private readonly _configService: ConfigService,
		private readonly metricsService: MetricsService,
		private readonly schedulerRegistry: SchedulerRegistry,
	) {
		this.config = this._configService.get('cache.warming') || {
			enabled: true,
			warmupOnStart: true,
			maxFilesToWarm: 50,
			warmupCron: '0 */6 * * *',
			popularImageThreshold: 5,
		}

		this.storagePath = join(cwd(), 'storage')

		// Load base cache TTL from configuration (default: 3600 seconds = 1 hour)
		this.baseCacheTtl = this._configService.getOptional('cache.warming.baseTtl', 3600)
	}

	async onModuleInit(): Promise<void> {
		if (this.config.enabled) {
			this.registerWarmupCron()
			if (this.config.warmupOnStart) {
				CorrelatedLogger.log('Starting cache warming on module initialization', CacheWarmingService.name)
				setImmediate(() => this.warmupCache())
			}
		}
	}

	/**
	 * Register the warmup cron job dynamically so it respects the configured schedule
	 * (CACHE_WARMING_CRON env var) instead of a hardcoded decorator value.
	 */
	private registerWarmupCron(): void {
		const schedule = this.config.warmupCron
		const cronName = 'cache-warming'

		const job = new CronJob(schedule, async () => {
			CorrelatedLogger.log('Starting scheduled cache warmup', CacheWarmingService.name)
			try {
				await this.warmupCache()
			}
			catch (error: unknown) {
				CorrelatedLogger.error(
					`Scheduled cache warmup failed: ${(error as Error).message}`,
					(error as Error).stack,
					CacheWarmingService.name,
				)
			}
		})

		this.schedulerRegistry.addCronJob(cronName, job)
		job.start()

		CorrelatedLogger.log(
			`Cache warming cron registered with schedule: ${schedule}`,
			CacheWarmingService.name,
		)
	}

	async warmupCache(): Promise<void> {
		if (!this.config.enabled) {
			CorrelatedLogger.debug('Cache warming is disabled', CacheWarmingService.name)
			return
		}

		const startTime = Date.now()
		let warmedCount = 0

		try {
			CorrelatedLogger.log('Starting cache warmup process', CacheWarmingService.name)

			const popularFiles = await this.getPopularFiles()

			for (const fileInfo of popularFiles.slice(0, this.config.maxFilesToWarm)) {
				try {
					await this.warmupFile(fileInfo)
					warmedCount++
				}
				catch (error: unknown) {
					CorrelatedLogger.warn(`Failed to warm up file ${fileInfo.path}: ${(error as Error).message}`, CacheWarmingService.name)
				}
			}

			const duration = Date.now() - startTime
			this.lastWarmup = new Date()
			this.lastFilesWarmed = warmedCount
			CorrelatedLogger.log(`Cache warmup completed: ${warmedCount} files warmed in ${duration}ms`, CacheWarmingService.name)

			this.metricsService.recordCacheOperation('warmup', 'memory', 'success')
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Cache warmup failed: ${(error as Error).message}`, (error as Error).stack, CacheWarmingService.name)
			this.metricsService.recordCacheOperation('warmup', 'memory', 'error')
		}
	}

	private async getPopularFiles(): Promise<FileAccessInfo[]> {
		const BATCH_SIZE = 50

		try {
			const dirEntries = await readdir(this.storagePath, { withFileTypes: true })

			// Filter to plain .rsc files only — no syscalls yet
			const rscEntries = dirEntries.filter(
				e => e.isFile() && e.name.endsWith('.rsc'),
			)

			const results: FileAccessInfo[] = []

			// Process in batches of BATCH_SIZE to bound peak concurrency
			for (let i = 0; i < rscEntries.length; i += BATCH_SIZE) {
				const batch = rscEntries.slice(i, i + BATCH_SIZE)

				const batchResults = await Promise.all(
					batch.map(async (entry) => {
						const filePath = join(this.storagePath, entry.name)
						const metaPath = filePath.replace('.rsc', '.rsm')

						try {
							// Pre-filter: skip files with no metadata — they have accessCount = 1
							// which is always below threshold, so stat() would be wasted I/O
							const metaAccessible = await access(metaPath).then(() => true, () => false)
							if (!metaAccessible) {
								return null
							}

							const [fileStat, metaContent] = await Promise.all([
								stat(filePath),
								readFile(metaPath, 'utf8').catch(() => null),
							])

							let accessCount = 1
							if (metaContent) {
								try {
									const metadata = JSON.parse(metaContent)
									accessCount = metadata.accessCount || 1
								}
								catch {
									// Ignore metadata parsing errors
								}
							}

							return {
								path: filePath,
								lastAccessed: fileStat.atime,
								accessCount,
								size: fileStat.size,
							} satisfies FileAccessInfo
						}
						catch (error: unknown) {
							CorrelatedLogger.debug(`Skipping file ${entry.name}: ${(error as Error).message}`, CacheWarmingService.name)
							return null
						}
					}),
				)

				for (const item of batchResults) {
					if (item !== null) {
						results.push(item)
					}
				}
			}

			return results
				.filter(f => f.accessCount >= this.config.popularImageThreshold)
				.sort((a, b) => {
					if (a.accessCount !== b.accessCount) {
						return b.accessCount - a.accessCount
					}
					return b.lastAccessed.getTime() - a.lastAccessed.getTime()
				})
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Failed to get popular files: ${(error as Error).message}`, (error as Error).stack, CacheWarmingService.name)
			return []
		}
	}

	private async warmupFile(fileInfo: FileAccessInfo): Promise<void> {
		const resourceId = this.extractResourceId(fileInfo.path)

		if (await this.cacheManager.exists('image', resourceId)) {
			CorrelatedLogger.debug(`File already in cache: ${fileInfo.path}`, CacheWarmingService.name)
			return
		}

		try {
			const metadataPath = fileInfo.path.replace(/\.rsc$/, '.rsm')
			const [content, metaRaw] = await Promise.all([
				readFile(fileInfo.path),
				readFile(metadataPath, 'utf8').catch(() => null),
			])

			let metadata: ResourceMetaData
			if (metaRaw) {
				try {
					metadata = new ResourceMetaData(JSON.parse(metaRaw))
				}
				catch {
					metadata = new ResourceMetaData()
				}
			}
			else {
				metadata = new ResourceMetaData()
			}

			const accessMultiplier = Math.min(fileInfo.accessCount / 10, 5)
			const ttl = Math.floor(this.baseCacheTtl * (1 + accessMultiplier))

			await this.cacheManager.set('image', resourceId, { data: content, metadata }, ttl)

			CorrelatedLogger.debug(`Warmed up file: ${fileInfo.path} (TTL: ${ttl}s)`, CacheWarmingService.name)
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Failed to warm up file ${fileInfo.path}: ${(error as Error).message}`, CacheWarmingService.name)
			throw error
		}
	}

	private extractResourceId(filePath: string): string {
		const filename = filePath.split('/').pop() || filePath.split('\\').pop()
		return filename?.replace(FILE_EXTENSION_RE, '') || ''
	}

	async warmupSpecificFile(resourceId: string, content: Buffer, ttl?: number): Promise<void> {
		try {
			const metadata = new ResourceMetaData({
				size: content.length.toString(),
				dateCreated: Date.now(),
			})
			// `ttl` is intentionally optional: undefined and 0 both fall through to
			// the configured default TTL inside RedisCacheService.set() (see fix #1
			// in redis-cache.service.ts). Callers that want a specific lifetime pass
			// an explicit positive value; callers that omit it rely on the config default.
			await this.cacheManager.set('image', resourceId, { data: content, metadata }, ttl)
			CorrelatedLogger.debug(`Manually warmed up resource: ${resourceId}`, CacheWarmingService.name)
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Failed to manually warm up resource ${resourceId}: ${(error as Error).message}`, (error as Error).stack, CacheWarmingService.name)
			throw error
		}
	}

	async getWarmupStats(): Promise<{
		enabled: boolean
		lastWarmup: Date | null
		filesWarmed: number
	}> {
		return {
			enabled: this.config.enabled,
			lastWarmup: this.lastWarmup,
			filesWarmed: this.lastFilesWarmed,
		}
	}
}
