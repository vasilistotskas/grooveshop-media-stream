import { OnModuleInit } from '@nestjs/common';
import { MemoryCacheService } from './memory-cache.service';
import { ConfigService } from '@microservice/Config/config.service';
import { MetricsService } from '@microservice/Metrics/services/metrics.service';
export declare class CacheWarmingService implements OnModuleInit {
    private readonly memoryCacheService;
    private readonly configService;
    private readonly metricsService;
    private readonly logger;
    private readonly config;
    private readonly storagePath;
    constructor(memoryCacheService: MemoryCacheService, configService: ConfigService, metricsService: MetricsService);
    onModuleInit(): Promise<void>;
    scheduledWarmup(): Promise<void>;
    warmupCache(): Promise<void>;
    private getPopularFiles;
    private warmupFile;
    private generateCacheKey;
    warmupSpecificFile(resourceId: string, content: Buffer, ttl?: number): Promise<void>;
    getWarmupStats(): Promise<{
        enabled: boolean;
        lastWarmup: Date | null;
        filesWarmed: number;
        cacheSize: number;
    }>;
}
