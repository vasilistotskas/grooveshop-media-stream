import type { CacheLayerStats } from '../interfaces/cache-layer.interface';
import { ConfigService } from '@microservice/Config/config.service';
import { MetricsService } from '@microservice/Metrics/services/metrics.service';
import { OnModuleInit } from '@nestjs/common';
import { FileCacheLayer } from '../layers/file-cache.layer';
import { MemoryCacheLayer } from '../layers/memory-cache.layer';
import { RedisCacheLayer } from '../layers/redis-cache.layer';
export interface MultiLayerCacheStats {
    layers: Record<string, CacheLayerStats>;
    totalHits: number;
    totalMisses: number;
    overallHitRate: number;
    layerHitDistribution: Record<string, number>;
}
export declare class MultiLayerCacheManager implements OnModuleInit {
    private readonly _configService;
    private readonly metricsService;
    private readonly memoryCacheLayer;
    private readonly redisCacheLayer;
    private readonly fileCacheLayer;
    private layers;
    private keyStrategy;
    private preloadingEnabled;
    private popularKeys;
    constructor(_configService: ConfigService, metricsService: MetricsService, memoryCacheLayer: MemoryCacheLayer, redisCacheLayer: RedisCacheLayer, fileCacheLayer: FileCacheLayer);
    onModuleInit(): Promise<void>;
    get<T>(namespace: string, identifier: string, params?: Record<string, any>): Promise<T | null>;
    set<T>(namespace: string, identifier: string, value: T, ttl?: number, params?: Record<string, any>): Promise<void>;
    delete(namespace: string, identifier: string, params?: Record<string, any>): Promise<void>;
    exists(namespace: string, identifier: string, params?: Record<string, any>): Promise<boolean>;
    clear(): Promise<void>;
    invalidateNamespace(namespace: string): Promise<void>;
    getStats(): Promise<MultiLayerCacheStats>;
    preloadPopularKeys(): Promise<void>;
    private backfillLayers;
    private trackKeyAccess;
    private startPreloading;
}
