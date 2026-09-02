import type { CacheLayer, CacheLayerStats } from '../interfaces/cache-layer.interface.js'
import { Injectable } from '@nestjs/common'
import { RedisCacheService } from '../services/redis-cache.service.js'

/**
 * Redis tier. Errors propagate: MultiLayerCacheManager catches them per layer
 * and records exactly one error sample, so nothing is swallowed here.
 */
@Injectable()
export class RedisCacheLayer implements CacheLayer {
	private readonly layerName = 'redis'
	private readonly priority = 2

	constructor(private readonly redisCacheService: RedisCacheService) {}

	get<T>(key: string): Promise<T | null> {
		return this.redisCacheService.get<T>(key)
	}

	set<T>(key: string, value: T, ttl?: number): Promise<void> {
		return this.redisCacheService.set(key, value, ttl)
	}

	delete(key: string): Promise<void> {
		return this.redisCacheService.delete(key)
	}

	async deleteByPrefix(prefix: string): Promise<number> {
		const client = this.redisCacheService.getClient()
		if (!client) {
			return 0
		}

		let count = 0
		let cursor = '0'
		do {
			const [nextCursor, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100)
			cursor = nextCursor
			if (keys.length > 0) {
				await client.del(...keys)
				count += keys.length
			}
		} while (cursor !== '0')

		return count
	}

	exists(key: string): Promise<boolean> {
		return this.redisCacheService.has(key)
	}

	clear(): Promise<void> {
		return this.redisCacheService.clear()
	}

	async getStats(): Promise<CacheLayerStats> {
		const stats = await this.redisCacheService.getStats()
		return {
			hits: stats.hits,
			misses: stats.misses,
			keys: stats.keys,
			hitRate: stats.hitRate,
			errors: this.redisCacheService.getConnectionStatus().stats.errors,
		}
	}

	getTtl(key: string): Promise<number> {
		return this.redisCacheService.getTtl(key)
	}

	getLayerName(): string {
		return this.layerName
	}

	getPriority(): number {
		return this.priority
	}
}
