export interface CacheLayer {
    get: <T>(key: string) => Promise<T | null>;
    set: <T>(key: string, value: T, ttl?: number) => Promise<void>;
    delete: (key: string) => Promise<void>;
    exists: (key: string) => Promise<boolean>;
    clear: () => Promise<void>;
    getStats: () => Promise<CacheLayerStats>;
    getLayerName: () => string;
    getPriority: () => number;
}
export interface CacheLayerStats {
    hits: number;
    misses: number;
    keys: number;
    hitRate: number;
    memoryUsage?: number;
    errors: number;
}
export interface CacheKeyStrategy {
    generateKey: (namespace: string, identifier: string, params?: Record<string, any>) => string;
    parseKey: (key: string) => {
        namespace: string;
        identifier: string;
        params?: Record<string, any>;
    };
    generateHash: (input: string) => string;
}
export interface CacheInvalidationStrategy {
    invalidateByPattern: (pattern: string) => Promise<string[]>;
    invalidateByNamespace: (namespace: string) => Promise<string[]>;
    invalidateByTags: (tags: string[]) => Promise<string[]>;
}
