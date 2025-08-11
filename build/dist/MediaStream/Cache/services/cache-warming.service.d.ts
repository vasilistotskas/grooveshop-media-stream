import { Buffer } from 'node:buffer';
import { MemoryCacheService } from '@microservice/Cache/services/memory-cache.service';
import { ConfigService } from '@microservice/Config/config.service';
import { MetricsService } from '@microservice/Metrics/services/metrics.service';
import { OnModuleInit } from '@nestjs/common';
export declare class CacheWarmingService implements OnModuleInit {
    private readonly memoryCacheService;
    private readonly _configService;
    private readonly metricsService;
    private readonly _logger;
    private readonly config;
    private readonly storagePath;
    constructor(memoryCacheService: MemoryCacheService, _configService: ConfigService, metricsService: MetricsService);
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
