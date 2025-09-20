export interface CacheLayer {
	/**
	 * Get a value from the cache layer
	 */
	get: <T>(key: string) => Promise<T | null>

	/**
	 * Set a value in the cache layer
	 */
	set: <T>(key: string, value: T, ttl?: number) => Promise<void>

	/**
	 * Delete a key from the cache layer
	 */
	delete: (key: string) => Promise<void>

	/**
	 * Check if a key exists in the cache layer
	 */
	exists: (key: string) => Promise<boolean>

	/**
	 * Clear all keys from the cache layer
	 */
	clear: () => Promise<void>

	/**
	 * Get cache layer statistics
	 */
	getStats: () => Promise<CacheLayerStats>

	/**
	 * Get the layer name for identification
	 */
	getLayerName: () => string

	/**
	 * Get the layer priority (lower number = higher priority)
	 */
	getPriority: () => number
}

export interface CacheLayerStats {
	hits: number
	misses: number
	keys: number
	hitRate: number
	memoryUsage?: number
	errors: number
}

export interface CacheKeyStrategy {
	/**
	 * Generate a consistent cache key
	 */
	generateKey: (namespace: string, identifier: string, params?: Record<string, any>) => string

	/**
	 * Parse a cache key back to its components
	 */
	parseKey: (key: string) => { namespace: string, identifier: string, params?: Record<string, any> }

	/**
	 * Generate a hash for consistent key distribution
	 */
	generateHash: (input: string) => string
}

export interface CacheInvalidationStrategy {
	/**
	 * Invalidate keys by pattern
	 */
	invalidateByPattern: (pattern: string) => Promise<string[]>

	/**
	 * Invalidate keys by namespace
	 */
	invalidateByNamespace: (namespace: string) => Promise<string[]>

	/**
	 * Invalidate keys by tags
	 */
	invalidateByTags: (tags: string[]) => Promise<string[]>
}
