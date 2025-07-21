import { ICacheManager, CacheStats } from '../interfaces/cache-manager.interface';
import { ConfigService } from '@microservice/Config/config.service';
import { MetricsService } from '@microservice/Metrics/services/metrics.service';
export declare class MemoryCacheService implements ICacheManager {
    private readonly configService;
    private readonly metricsService;
    private readonly logger;
    private readonly cache;
    constructor(configService: ConfigService, metricsService: MetricsService);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    getStats(): Promise<CacheStats>;
    has(key: string): Promise<boolean>;
    keys(): Promise<string[]>;
    flushAll(): Promise<void>;
    getTtl(key: string): number;
    setTtl(key: string, ttl: number): boolean;
    getMemoryUsage(): {
        used: number;
        total: number;
    };
}
