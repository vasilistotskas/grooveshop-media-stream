export interface CacheStats {
	hits: number
	misses: number
	keys: number
	ksize: number
	vsize: number
	hitRate: number
	memoryUsage?: number
}

/** Contract shared by the memory and Redis services behind the cache layers. */
export interface ICacheManager {
	get: <T>(key: string) => Promise<T | null>
	set: <T>(key: string, value: T, ttl?: number) => Promise<void>
	delete: (key: string) => Promise<void>
	clear: () => Promise<void>
	getStats: () => Promise<CacheStats>
	has: (key: string) => Promise<boolean>
}
