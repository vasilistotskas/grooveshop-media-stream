import { CanActivate, ExecutionContext } from '@nestjs/common';
import { RateLimitMetricsService } from '../services/rate-limit-metrics.service';
import { RateLimitService } from '../services/rate-limit.service';
export declare class AdaptiveRateLimitGuard implements CanActivate {
    private readonly rateLimitService;
    private readonly rateLimitMetricsService;
    private readonly _logger;
    constructor(rateLimitService: RateLimitService, rateLimitMetricsService: RateLimitMetricsService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private shouldSkipRateLimit;
    private isDomainWhitelisted;
    private matchesDomain;
    private getClientIp;
    private getRequestType;
    private addRateLimitHeaders;
}
