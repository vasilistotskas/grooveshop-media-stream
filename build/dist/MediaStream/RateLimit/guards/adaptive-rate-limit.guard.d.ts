import { CanActivate, ExecutionContext } from '@nestjs/common';
import { RateLimitMetricsService } from '../services/rate-limit-metrics.service';
import { RateLimitService } from '../services/rate-limit.service';
export declare class AdaptiveRateLimitGuard implements CanActivate {
    private readonly rateLimitService;
    private readonly rateLimitMetricsService;
    private readonly logger;
    constructor(rateLimitService: RateLimitService, rateLimitMetricsService: RateLimitMetricsService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private shouldSkipRateLimit;
    private getClientIp;
    private getRequestType;
    private addRateLimitHeaders;
}
