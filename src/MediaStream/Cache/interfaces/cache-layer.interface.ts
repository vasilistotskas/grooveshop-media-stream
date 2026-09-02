export interface CacheLayer {
	get: <T>(key: string) => Promise<T | null>
	set: <T>(key: string, value: T, ttl?: number) => Promise<void>
	delete: (key: string) => Promise<void>
	exists: (key: string) => Promise<boolean>
	/** Delete all keys matching a prefix; returns the count removed. */
	deleteByPrefix: (prefix: string) => Promise<number>
	clear: () => Promise<void>
	getStats: () => Promise<CacheLayerStats>
	getLayerName: () => string
	/** Lower number = checked first. */
	getPriority: () => number
	/** Remaining TTL in seconds; -1 when unknown or the key has no expiry. */
	getTtl: (key: string) => Promise<number>
}

export interface CacheLayerStats {
	hits: number
	misses: number
	keys: number
	hitRate: number
	memoryUsage?: number
	errors: number
}
