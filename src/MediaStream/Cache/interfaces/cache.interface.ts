export interface ICacheManager<T = any> {
	get: <K = T>(key: string) => Promise<K | null>
	set: <K = T>(key: string, value: K, ttl?: number) => Promise<void>
	delete: (key: string) => Promise<boolean>
	clear: () => Promise<void>
	has: (key: string) => Promise<boolean>
	getStats: () => Promise<CacheStats>
	keys: () => Promise<string[]>
	mget: (keys: string[]) => Promise<Array<T | null>>
	mset: (entries: Array<{ key: string, value: T, ttl?: number }>) => Promise<void>
}

export interface CacheStats {
	hits: number
	misses: number
	keys: number
	ksize: number
	vsize: number
	hitRate: number
	missRate: number
}
