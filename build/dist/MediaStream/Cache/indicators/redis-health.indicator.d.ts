import { ConfigService } from '@microservice/Config/config.service';
import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { RedisCacheService } from '../services/redis-cache.service';
export declare class RedisHealthIndicator extends BaseHealthIndicator {
    private readonly redisCacheService;
    private readonly configService;
    constructor(redisCacheService: RedisCacheService, configService: ConfigService);
    protected performHealthCheck(): Promise<HealthIndicatorResult>;
    private generateWarnings;
    getDetailedStatus(): Promise<any>;
    protected getDescription(): string;
}
