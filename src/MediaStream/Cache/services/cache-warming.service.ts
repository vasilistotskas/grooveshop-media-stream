import { Buffer } from 'node:buffer'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { MemoryCacheService } from '@microservice/Cache/services/memory-cache.service'
import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

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
	private readonly logger = new Logger(CacheWarmingService.name)
	private readonly config: CacheWarmingConfig
	private readonly storagePath: string

	constructor(
		private readonly memoryCacheService: MemoryCacheService,
		private readonly configService: ConfigService,
		private readonly metricsService: MetricsService,
	) {
		this.config = this.configService.get('cache.warming') || {
			enabled: true,
			warmupOnStart: true,
			maxFilesToWarm: 50,
			warmupCron: '0 */6 * * *', // Every 6 hours
			popularImageThreshold: 5,
		}

		this.storagePath = join(cwd(), 'storage')
	}

	async onModuleInit(): Promise<void> {
		if (this.config.enabled && this.config.warmupOnStart) {
			CorrelatedLogger.log('Starting cache warming on module initialization', CacheWarmingService.name)
			// Run warmup in background to not block startup
			setImmediate(() => this.warmupCache())
		}
	}

	@Cron(CronExpression.EVERY_6_HOURS)
	async scheduledWarmup(): Promise<void> {
		if (this.config.enabled) {
			CorrelatedLogger.log('Starting scheduled cache warmup', CacheWarmingService.name)
			await this.warmupCache()
		}
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

			// Get popular files based on access patterns
			const popularFiles = await this.getPopularFiles()

			for (const fileInfo of popularFiles.slice(0, this.config.maxFilesToWarm)) {
				try {
					await this.warmupFile(fileInfo)
					warmedCount++
				}
				catch (error) {
					CorrelatedLogger.warn(`Failed to warm up file ${fileInfo.path}: ${error.message}`, CacheWarmingService.name)
				}
			}

			const duration = Date.now() - startTime
			CorrelatedLogger.log(`Cache warmup completed: ${warmedCount} files warmed in ${duration}ms`, CacheWarmingService.name)

			// Record metrics
			this.metricsService.recordCacheOperation('warmup', 'memory', 'success')
		}
		catch (error) {
			CorrelatedLogger.error(`Cache warmup failed: ${error.message}`, error.stack, CacheWarmingService.name)
			this.metricsService.recordCacheOperation('warmup', 'memory', 'error')
		}
	}

	private async getPopularFiles(): Promise<FileAccessInfo[]> {
		const files: FileAccessInfo[] = []

		try {
			const entries = await readdir(this.storagePath)

			for (const entry of entries) {
				if (entry.endsWith('.rsc')) { // Resource files
					const filePath = join(this.storagePath, entry)
					const metaPath = filePath.replace('.rsc', '.rsm')

					try {
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

						files.push({
							path: filePath,
							lastAccessed: fileStat.atime,
							accessCount,
							size: fileStat.size,
						})
					}
					catch (error) {
						CorrelatedLogger.debug(`Skipping file ${entry}: ${error.message}`, CacheWarmingService.name)
					}
				}
			}

			// Sort by access count (descending) and last accessed (recent first)
			return files
				.filter(f => f.accessCount >= this.config.popularImageThreshold)
				.sort((a, b) => {
					if (a.accessCount !== b.accessCount) {
						return b.accessCount - a.accessCount
					}
					return b.lastAccessed.getTime() - a.lastAccessed.getTime()
				})
		}
		catch (error) {
			CorrelatedLogger.error(`Failed to get popular files: ${error.message}`, error.stack, CacheWarmingService.name)
			return []
		}
	}

	private async warmupFile(fileInfo: FileAccessInfo): Promise<void> {
		const cacheKey = this.generateCacheKey(fileInfo.path)

		// Check if already in cache
		if (await this.memoryCacheService.has(cacheKey)) {
			CorrelatedLogger.debug(`File already in cache: ${fileInfo.path}`, CacheWarmingService.name)
			return
		}

		try {
			// Read file content
			const content = await readFile(fileInfo.path)

			// Calculate TTL based on access patterns (more popular = longer TTL)
			const baseTtl = 3600 // 1 hour
			const accessMultiplier = Math.min(fileInfo.accessCount / 10, 5) // Max 5x multiplier
			const ttl = Math.floor(baseTtl * (1 + accessMultiplier))

			// Store in memory cache
			await this.memoryCacheService.set(cacheKey, content, ttl)

			CorrelatedLogger.debug(`Warmed up file: ${fileInfo.path} (TTL: ${ttl}s)`, CacheWarmingService.name)
		}
		catch (error) {
			CorrelatedLogger.warn(`Failed to warm up file ${fileInfo.path}: ${error.message}`, CacheWarmingService.name)
			throw error
		}
	}

	private generateCacheKey(filePath: string): string {
		// Extract filename without extension and use as cache key
		const filename = filePath.split('/').pop() || filePath.split('\\').pop()
		return `file:${filename?.replace(/\.[^/.]+$/, '')}`
	}

	async warmupSpecificFile(resourceId: string, content: Buffer, ttl?: number): Promise<void> {
		try {
			const cacheKey = `file:${resourceId}`
			await this.memoryCacheService.set(cacheKey, content, ttl)
			CorrelatedLogger.debug(`Manually warmed up resource: ${resourceId}`, CacheWarmingService.name)
		}
		catch (error) {
			CorrelatedLogger.error(`Failed to manually warm up resource ${resourceId}: ${error.message}`, error.stack, CacheWarmingService.name)
			throw error
		}
	}

	async getWarmupStats(): Promise<{
		enabled: boolean
		lastWarmup: Date | null
		filesWarmed: number
		cacheSize: number
	}> {
		const stats = await this.memoryCacheService.getStats()

		return {
			enabled: this.config.enabled,
			lastWarmup: null, // TODO: Track last warmup time
			filesWarmed: stats.keys,
			cacheSize: stats.vsize + stats.ksize,
		}
	}
}
