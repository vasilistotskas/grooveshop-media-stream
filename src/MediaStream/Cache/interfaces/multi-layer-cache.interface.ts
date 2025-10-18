import type { StringMap } from '#microservice/common/types/common.types'

export interface CacheLayer {
	name: string
	priority: number
	get: <T>(key: string) => Promise<T | null>
	set: <T>(key: string, value: T, ttl?: number) => Promise<void>
	delete: (key: string) => Promise<void>
	clear: () => Promise<void>
	has: (key: string) => Promise<boolean>
	getStats: () => Promise<CacheStats>
}

export interface CacheStats {
	hits: number
	misses: number
	keys: number
	ksize: number
	vsize: number
	hitRate: number
}

export interface CacheKeyStrategy {
	generateKey: (operation: string, params: StringMap) => string
	parseKey: (key: string) => { operation: string, hash: string }
}

export interface CacheInvalidationStrategy {
	shouldInvalidate: (key: string, operation: string) => boolean
	getRelatedKeys: (key: string) => string[]
}

export interface CachePreloadingStrategy {
	shouldPreload: (key: string) => boolean
	getPreloadKeys: () => Promise<string[]>
	preloadData: (key: string) => Promise<any>
}

export interface MultiLayerCacheConfig {
	layers: {
		memory: {
			enabled: boolean
			priority: number
			maxSize: number
			ttl: number
		}
		redis: {
			enabled: boolean
			priority: number
			ttl: number
		}
		file: {
			enabled: boolean
			priority: number
			ttl: number
		}
	}
	keyStrategy: {
		prefix: string
		separator: string
		hashAlgorithm: string
	}
	invalidation: {
		enabled: boolean
		patterns: string[]
	}
	preloading: {
		enabled: boolean
		popularThreshold: number
		maxPreloadKeys: number
	}
}
