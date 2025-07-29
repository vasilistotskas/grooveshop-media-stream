import type { CacheLayer, CacheLayerStats } from '../interfaces/cache-layer.interface';
import { RedisCacheService } from '../services/redis-cache.service';
export declare class RedisCacheLayer implements CacheLayer {
    private readonly redisCacheService;
    private readonly layerName;
    private readonly priority;
    constructor(redisCacheService: RedisCacheService);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    clear(): Promise<void>;
    getStats(): Promise<CacheLayerStats>;
    getLayerName(): string;
    getPriority(): number;
}
