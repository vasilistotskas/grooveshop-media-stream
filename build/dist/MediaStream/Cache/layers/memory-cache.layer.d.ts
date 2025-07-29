import type { CacheLayer, CacheLayerStats } from '../interfaces/cache-layer.interface';
import { MemoryCacheService } from '../services/memory-cache.service';
export declare class MemoryCacheLayer implements CacheLayer {
    private readonly memoryCacheService;
    private readonly layerName;
    private readonly priority;
    constructor(memoryCacheService: MemoryCacheService);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    clear(): Promise<void>;
    getStats(): Promise<CacheLayerStats>;
    getLayerName(): string;
    getPriority(): number;
}
