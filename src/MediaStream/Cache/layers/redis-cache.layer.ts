import type { CacheLayer, CacheLayerStats } from '../interfaces/cache-layer.interface'
import { Injectable } from '@nestjs/common'
import { RedisCacheService } from '../services/redis-cache.service'

@Injectable()
export class RedisCacheLayer implements CacheLayer {
	private readonly layerName = 'redis'
	private readonly priority = 2

	constructor(private readonly redisCacheService: RedisCacheService) {}

	async get<T>(key: string): Promise<T | null> {
		try {
			return await this.redisCacheService.get<T>(key)
		}
		catch {
			return null
		}
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		try {
			await this.redisCacheService.set(key, value, ttl)
		}
		catch {
			// Silently fail for Redis layer
		}
	}

	async delete(key: string): Promise<void> {
		try {
			await this.redisCacheService.delete(key)
		}
		catch {
			// Silently fail for Redis layer
		}
	}

	async exists(key: string): Promise<boolean> {
		try {
			return await this.redisCacheService.has(key)
		}
		catch {
			return false
		}
	}

	async clear(): Promise<void> {
		try {
			await this.redisCacheService.clear()
		}
		catch {
			// Silently fail for Redis layer
		}
	}

	async getStats(): Promise<CacheLayerStats> {
		try {
			const stats = await this.redisCacheService.getStats()
			const connectionStatus = this.redisCacheService.getConnectionStatus()
			return {
				hits: stats.hits,
				misses: stats.misses,
				keys: stats.keys,
				hitRate: stats.hitRate,
				errors: connectionStatus.stats.errors,
			}
		}
		catch {
			return {
				hits: 0,
				misses: 0,
				keys: 0,
				hitRate: 0,
				errors: 1,
			}
		}
	}

	getLayerName(): string {
		return this.layerName
	}

	getPriority(): number {
		return this.priority
	}
}
