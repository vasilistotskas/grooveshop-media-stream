export interface ICacheManager<T = any> {
    get<K = T>(key: string): Promise<K | null>;
    set<K = T>(key: string, value: K, ttl?: number): Promise<void>;
    delete(key: string): Promise<boolean>;
    clear(): Promise<void>;
    has(key: string): Promise<boolean>;
    getStats(): Promise<CacheStats>;
    keys(): Promise<string[]>;
    mget(keys: string[]): Promise<Array<T | null>>;
    mset(entries: Array<{
        key: string;
        value: T;
        ttl?: number;
    }>): Promise<void>;
}
export interface CacheStats {
    hits: number;
    misses: number;
    keys: number;
    ksize: number;
    vsize: number;
    hitRate: number;
    missRate: number;
}
export interface CacheEntry<T = any> {
    key: string;
    value: T;
    ttl: number;
    createdAt: number;
    lastAccessed: number;
    accessCount: number;
    size: number;
}
export interface CacheConfig {
    maxSize: number;
    ttl: number;
    checkPeriod: number;
    useClones: boolean;
    deleteOnExpire: boolean;
    enableLegacyCallbacks: boolean;
}
export interface CacheMetrics {
    totalHits: number;
    totalMisses: number;
    totalKeys: number;
    memoryUsage: number;
    hitRate: number;
    missRate: number;
    evictions: number;
    lastEvictionTime?: number;
}
