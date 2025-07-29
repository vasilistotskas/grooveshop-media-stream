import type { CacheLayer, CacheLayerStats } from '../interfaces/cache-layer.interface'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { Injectable } from '@nestjs/common'

interface FileCacheEntry<T> {
	value: T
	timestamp: number
	ttl?: number
}

@Injectable()
export class FileCacheLayer implements CacheLayer {
	private readonly layerName = 'file'
	private readonly priority = 3 // Lowest priority
	private readonly cacheDirectory: string
	private stats = {
		hits: 0,
		misses: 0,
		errors: 0,
	}

	constructor(private readonly configService: ConfigService) {
		this.cacheDirectory = this.configService.get('cache.file.directory')
		this.ensureCacheDirectory()
	}

	async get<T>(key: string): Promise<T | null> {
		try {
			const filePath = this.getFilePath(key)
			const data = await fs.readFile(filePath, 'utf8')
			const entry: FileCacheEntry<T> = JSON.parse(data)

			// Check TTL
			if (entry.ttl && Date.now() - entry.timestamp > entry.ttl * 1000) {
				await this.delete(key)
				this.stats.misses++
				return null
			}

			this.stats.hits++
			return entry.value
		}
		catch {
			this.stats.misses++
			return null
		}
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		try {
			const filePath = this.getFilePath(key)
			const entry: FileCacheEntry<T> = {
				value,
				timestamp: Date.now(),
				ttl,
			}

			await fs.writeFile(filePath, JSON.stringify(entry), 'utf8')
			CorrelatedLogger.debug(`File cache SET: ${key}`, FileCacheLayer.name)
		}
		catch (error) {
			this.stats.errors++
			CorrelatedLogger.error(
				`File cache SET failed: ${error.message}`,
				error.stack,
				FileCacheLayer.name,
			)
		}
	}

	async delete(key: string): Promise<void> {
		try {
			const filePath = this.getFilePath(key)
			await fs.unlink(filePath)
			CorrelatedLogger.debug(`File cache DELETE: ${key}`, FileCacheLayer.name)
		}
		catch (error) {
			if (error.code !== 'ENOENT') {
				this.stats.errors++
				CorrelatedLogger.error(
					`File cache DELETE failed: ${error.message}`,
					error.stack,
					FileCacheLayer.name,
				)
			}
		}
	}

	async exists(key: string): Promise<boolean> {
		try {
			const filePath = this.getFilePath(key)
			await fs.access(filePath)
			return true
		}
		catch {
			return false
		}
	}

	async clear(): Promise<void> {
		try {
			const files = await fs.readdir(this.cacheDirectory)
			await Promise.all(
				files.map(file => fs.unlink(join(this.cacheDirectory, file)).catch(() => {})),
			)
			CorrelatedLogger.debug('File cache CLEARED', FileCacheLayer.name)
		}
		catch (error) {
			this.stats.errors++
			CorrelatedLogger.error(
				`File cache CLEAR failed: ${error.message}`,
				error.stack,
				FileCacheLayer.name,
			)
		}
	}

	async getStats(): Promise<CacheLayerStats> {
		try {
			const files = await fs.readdir(this.cacheDirectory)
			const totalRequests = this.stats.hits + this.stats.misses
			return {
				hits: this.stats.hits,
				misses: this.stats.misses,
				keys: files.length,
				hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
				errors: this.stats.errors,
			}
		}
		catch {
			return {
				hits: this.stats.hits,
				misses: this.stats.misses,
				keys: 0,
				hitRate: 0,
				errors: this.stats.errors + 1,
			}
		}
	}

	getLayerName(): string {
		return this.layerName
	}

	getPriority(): number {
		return this.priority
	}

	private getFilePath(key: string): string {
		// Sanitize key for filesystem
		const sanitizedKey = key.replace(/[^\w\-.:]/g, '_')
		return join(this.cacheDirectory, `${sanitizedKey}.json`)
	}

	private async ensureCacheDirectory(): Promise<void> {
		try {
			await fs.mkdir(this.cacheDirectory, { recursive: true })
		}
		catch (error) {
			CorrelatedLogger.error(
				`Failed to create cache directory: ${error.message}`,
				error.stack,
				FileCacheLayer.name,
			)
		}
	}
}
