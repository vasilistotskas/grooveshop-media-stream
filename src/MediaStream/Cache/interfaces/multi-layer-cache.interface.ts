import type { StringMap } from '#microservice/common/types/common.types'

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
