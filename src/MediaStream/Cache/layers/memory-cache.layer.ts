import type { CacheLayer, CacheLayerStats } from '../interfaces/cache-layer.interface.js'
import { Injectable } from '@nestjs/common'
import { MemoryCacheService } from '../services/memory-cache.service.js'

@Injectable()
export class MemoryCacheLayer implements CacheLayer {
	private readonly layerName = 'memory'
	private readonly priority = 1

	constructor(private readonly memoryCacheService: MemoryCacheService) {}

	async get<T>(key: string): Promise<T | null> {
		return this.memoryCacheService.get<T>(key)
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		await this.memoryCacheService.set(key, value, ttl)
	}

	async delete(key: string): Promise<void> {
		await this.memoryCacheService.delete(key)
	}

	async deleteByPrefix(prefix: string): Promise<number> {
		const allKeys = await this.memoryCacheService.keys()
		const matchingKeys = allKeys.filter(k => k.startsWith(prefix))
		await Promise.all(matchingKeys.map(key => this.memoryCacheService.delete(key)))
		return matchingKeys.length
	}

	async exists(key: string): Promise<boolean> {
		return this.memoryCacheService.has(key)
	}

	async clear(): Promise<void> {
		await this.memoryCacheService.clear()
	}

	async getStats(): Promise<CacheLayerStats> {
		const stats = await this.memoryCacheService.getStats()
		return {
			hits: stats.hits,
			misses: stats.misses,
			keys: stats.keys,
			hitRate: stats.hitRate,
			memoryUsage: stats.memoryUsage || (stats.vsize + stats.ksize),
			errors: 0,
		}
	}

	async getTtl(key: string): Promise<number> {
		const ttlMs = this.memoryCacheService.getTtl(key)
		if (!ttlMs || ttlMs === 0) {
			return -1
		}
		// getTtl returns absolute expiry timestamp in ms, convert to remaining seconds
		return Math.max(0, Math.ceil((ttlMs - Date.now()) / 1000))
	}

	getLayerName(): string {
		return this.layerName
	}

	getPriority(): number {
		return this.priority
	}
}
