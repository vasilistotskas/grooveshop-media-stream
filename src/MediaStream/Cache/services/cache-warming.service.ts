import { Buffer } from 'node:buffer'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { MemoryCacheService } from '@microservice/Cache/services/memory-cache.service'
import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { Injectable, OnModuleInit } from '@nestjs/common'
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
	private readonly config: CacheWarmingConfig
	private readonly storagePath: string

	constructor(
		private readonly memoryCacheService: MemoryCacheService,
		private readonly _configService: ConfigService,
		private readonly metricsService: MetricsService,
	) {
		this.config = this._configService.get('cache.warming') || {
			enabled: true,
			warmupOnStart: true,
			maxFilesToWarm: 50,
			warmupCron: '0 */6 * * *',
			popularImageThreshold: 5,
		}

		this.storagePath = join(cwd(), 'storage')
	}

	async onModuleInit(): Promise<void> {
		if (this.config.enabled && this.config.warmupOnStart) {
			CorrelatedLogger.log('Starting cache warming on module initialization', CacheWarmingService.name)
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
			CorrelatedLogger.log(`Cache warmup completed: ${warmedCount} files warmed in ${duration}ms`, CacheWarmingService.name)

			this.metricsService.recordCacheOperation('warmup', 'memory', 'success')
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Cache warmup failed: ${(error as Error).message}`, (error as Error).stack, CacheWarmingService.name)
			this.metricsService.recordCacheOperation('warmup', 'memory', 'error')
		}
	}

	private async getPopularFiles(): Promise<FileAccessInfo[]> {
		const files: FileAccessInfo[] = []

		try {
			const entries = await readdir(this.storagePath)

			for (const entry of entries) {
				if (entry.endsWith('.rsc')) {
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
					catch (error: unknown) {
						CorrelatedLogger.debug(`Skipping file ${entry}: ${(error as Error).message}`, CacheWarmingService.name)
					}
				}
			}

			return files
				.filter(f => f.accessCount >= this.config.popularImageThreshold)
				.sort((a: any, b: any) => {
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
		const cacheKey = this.generateCacheKey(fileInfo.path)

		if (await this.memoryCacheService.has(cacheKey)) {
			CorrelatedLogger.debug(`File already in cache: ${fileInfo.path}`, CacheWarmingService.name)
			return
		}

		try {
			const content = await readFile(fileInfo.path)

			const baseTtl = 3600
			const accessMultiplier = Math.min(fileInfo.accessCount / 10, 5)
			const ttl = Math.floor(baseTtl * (1 + accessMultiplier))

			await this.memoryCacheService.set(cacheKey, content, ttl)

			CorrelatedLogger.debug(`Warmed up file: ${fileInfo.path} (TTL: ${ttl}s)`, CacheWarmingService.name)
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Failed to warm up file ${fileInfo.path}: ${(error as Error).message}`, CacheWarmingService.name)
			throw error
		}
	}

	private generateCacheKey(filePath: string): string {
		const filename = filePath.split('/').pop() || filePath.split('\\').pop()
		return `file:${filename?.replace(/\.[^/.]+$/, '')}`
	}

	async warmupSpecificFile(resourceId: string, content: Buffer, ttl?: number): Promise<void> {
		try {
			const cacheKey = `file:${resourceId}`
			await this.memoryCacheService.set(cacheKey, content, ttl)
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
