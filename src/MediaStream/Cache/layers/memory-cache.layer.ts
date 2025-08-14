import type { CacheLayer, CacheLayerStats } from '../interfaces/cache-layer.interface'
import { Injectable } from '@nestjs/common'
import { MemoryCacheService } from '../services/memory-cache.service'

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

	getLayerName(): string {
		return this.layerName
	}

	getPriority(): number {
		return this.priority
	}
}
