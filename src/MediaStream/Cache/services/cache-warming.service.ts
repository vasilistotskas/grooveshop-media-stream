import type { OnModuleInit } from '@nestjs/common'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Injectable } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { imageNamespace } from '../utils/cache-namespace.util.js'
import { MultiLayerCacheManager } from './multi-layer-cache.manager.js'

const RESOURCE_EXTENSION = '.rsc'
const METADATA_EXTENSION = '.rsm'
/** Sidecars read per Promise.all batch while scanning the storage directory. */
const SCAN_BATCH_SIZE = 50

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
	metadata: ResourceMetaData
}

/**
 * Re-populates the layered cache from the on-disk tier with the most
 * accessed entries (by sidecar `accessCount`), on a cron and optionally at boot.
 */
@Injectable()
export class CacheWarmingService implements OnModuleInit {
	private readonly config: CacheWarmingConfig
	private readonly storagePath: string
	private readonly baseCacheTtl: number
	private lastWarmup: Date | null = null
	private lastFilesWarmed = 0

	constructor(
		private readonly cacheManager: MultiLayerCacheManager,
		configService: ConfigService,
		private readonly metricsService: MetricsService,
		private readonly schedulerRegistry: SchedulerRegistry,
	) {
		this.config = configService.get<CacheWarmingConfig>('cache.warming')
		this.storagePath = storageDirectory(configService)
		this.baseCacheTtl = configService.get('cache.warming.baseTtl')
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

		const job = new CronJob(schedule, async () => {
			CorrelatedLogger.log('Starting scheduled cache warmup', CacheWarmingService.name)
			try {
				await this.warmupCache()
			}
			catch (error: unknown) {
				CorrelatedLogger.error(`Scheduled cache warmup failed: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, CacheWarmingService.name)
			}
		})

		this.schedulerRegistry.addCronJob('cache-warming', job)
		job.start()

		CorrelatedLogger.log(`Cache warming cron registered with schedule: ${schedule}`, CacheWarmingService.name)
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
					CorrelatedLogger.warn(`Failed to warm up file ${fileInfo.path}: ${errorMessage(error)}`, CacheWarmingService.name)
				}
			}

			const duration = Date.now() - startTime
			this.lastWarmup = new Date()
			this.lastFilesWarmed = warmedCount
			CorrelatedLogger.log(`Cache warmup completed: ${warmedCount} files warmed in ${duration}ms`, CacheWarmingService.name)

			this.metricsService.recordCacheOperation('warmup', 'memory', 'success')
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Cache warmup failed: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, CacheWarmingService.name)
			this.metricsService.recordCacheOperation('warmup', 'memory', 'error')
		}
	}

	/** Every `.rsc` with a readable sidecar at or above the popularity threshold, most accessed first. */
	private async getPopularFiles(): Promise<FileAccessInfo[]> {
		try {
			const dirEntries = await readdir(this.storagePath, { withFileTypes: true })
			const rscEntries = dirEntries.filter(e => e.isFile() && e.name.endsWith(RESOURCE_EXTENSION))

			const results: FileAccessInfo[] = []

			// Bounded concurrency: one batch of stat + sidecar reads at a time
			for (let i = 0; i < rscEntries.length; i += SCAN_BATCH_SIZE) {
				const batch = rscEntries.slice(i, i + SCAN_BATCH_SIZE)

				const batchResults = await Promise.all(
					batch.map(async (entry): Promise<FileAccessInfo | null> => {
						const filePath = join(this.storagePath, entry.name)
						const metaPath = join(this.storagePath, `${basename(entry.name, RESOURCE_EXTENSION)}${METADATA_EXTENSION}`)

						try {
							const [fileStat, metaContent] = await Promise.all([
								stat(filePath),
								readFile(metaPath, 'utf8'),
							])
							return {
								path: filePath,
								lastAccessed: fileStat.atime,
								metadata: new ResourceMetaData(JSON.parse(metaContent)),
							}
						}
						catch (error: unknown) {
							// No sidecar, or an unreadable one: nothing to score the file by
							CorrelatedLogger.debug(`Skipping file ${entry.name}: ${errorMessage(error)}`, CacheWarmingService.name)
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
				.filter(f => f.metadata.accessCount >= this.config.popularImageThreshold)
				.sort((a, b) => {
					if (a.metadata.accessCount !== b.metadata.accessCount) {
						return b.metadata.accessCount - a.metadata.accessCount
					}
					return b.lastAccessed.getTime() - a.lastAccessed.getTime()
				})
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Failed to get popular files: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined, CacheWarmingService.name)
			return []
		}
	}

	private async warmupFile(fileInfo: FileAccessInfo): Promise<void> {
		const resourceId = basename(fileInfo.path, RESOURCE_EXTENSION)
		const namespace = imageNamespace(fileInfo.metadata.tenantSchema)

		if (await this.cacheManager.exists(namespace, resourceId)) {
			CorrelatedLogger.debug(`File already in cache: ${fileInfo.path}`, CacheWarmingService.name)
			return
		}

		const content = await readFile(fileInfo.path)

		// Access-weighted TTL: popular files live up to 6x longer
		const accessMultiplier = Math.min(fileInfo.metadata.accessCount / 10, 5)
		const ttl = Math.floor(this.baseCacheTtl * (1 + accessMultiplier))

		await this.cacheManager.set(namespace, resourceId, { data: content, metadata: fileInfo.metadata }, ttl)

		CorrelatedLogger.debug(`Warmed up file: ${fileInfo.path} (ns=${namespace}, TTL: ${ttl}s)`, CacheWarmingService.name)
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
