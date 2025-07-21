import { HealthIndicatorResult } from '@nestjs/terminus';
import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator';
import { MemoryCacheService } from '../services/memory-cache.service';
import { CacheWarmingService } from '../services/cache-warming.service';
import { ConfigService } from '@microservice/Config/config.service';
export declare class CacheHealthIndicator extends BaseHealthIndicator {
    private readonly memoryCacheService;
    private readonly cacheWarmingService;
    private readonly configService;
    constructor(memoryCacheService: MemoryCacheService, cacheWarmingService: CacheWarmingService, configService: ConfigService);
    protected performHealthCheck(): Promise<HealthIndicatorResult>;
    private generateWarnings;
    getDetailedStatus(): Promise<any>;
    protected getDescription(): string;
}
