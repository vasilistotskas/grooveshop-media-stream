import { ConfigService } from '@microservice/Config/config.service';
import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { CacheWarmingService } from '../services/cache-warming.service';
import { MemoryCacheService } from '../services/memory-cache.service';
export declare class CacheHealthIndicator extends BaseHealthIndicator {
    private readonly memoryCacheService;
    private readonly cacheWarmingService;
    private readonly _configService;
    constructor(memoryCacheService: MemoryCacheService, cacheWarmingService: CacheWarmingService, _configService: ConfigService);
    protected performHealthCheck(): Promise<HealthIndicatorResult>;
    private generateWarnings;
    getDetailedStatus(): Promise<any>;
    protected getDescription(): string;
}
