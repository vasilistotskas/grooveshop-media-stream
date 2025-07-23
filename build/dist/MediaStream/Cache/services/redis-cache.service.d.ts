import { ConfigService } from '@microservice/Config/config.service';
import { MetricsService } from '@microservice/Metrics/services/metrics.service';
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CacheStats, ICacheManager } from '../interfaces/cache-manager.interface';
export declare class RedisCacheService implements ICacheManager, OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly metricsService;
    private readonly logger;
    private redis;
    private isConnected;
    private stats;
    constructor(configService: ConfigService, metricsService: MetricsService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private initializeRedis;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    has(key: string): Promise<boolean>;
    keys(): Promise<string[]>;
    flushAll(): Promise<void>;
    getStats(): Promise<CacheStats>;
    ping(): Promise<string>;
    getTtl(key: string): Promise<number>;
    setTtl(key: string, ttl: number): Promise<boolean>;
    getConnectionStatus(): {
        connected: boolean;
        stats: typeof this.stats;
    };
    getMemoryUsage(): Promise<{
        used: number;
        peak: number;
        fragmentation: number;
    }>;
    private extractMemoryValue;
}
