import { ConfigService } from '@microservice/Config/config.service';
import { MetricsService } from '@microservice/Metrics/services/metrics.service';
export interface RateLimitConfig {
    windowMs: number;
    max: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
    keyGenerator?: (req: any) => string;
}
export interface RateLimitInfo {
    limit: number;
    current: number;
    remaining: number;
    resetTime: Date;
}
export interface SystemLoadInfo {
    cpuUsage: number;
    memoryUsage: number;
    activeConnections: number;
}
export declare class RateLimitService {
    private readonly _configService;
    private readonly metricsService;
    private readonly _logger;
    private readonly requestCounts;
    private readonly systemLoadThresholds;
    constructor(_configService: ConfigService, metricsService: MetricsService);
    generateKey(ip: string, requestType: string): string;
    generateAdvancedKey(ip: string, userAgent: string, requestType: string): string;
    getRateLimitConfig(requestType: string): RateLimitConfig;
    checkRateLimit(key: string, config: RateLimitConfig): Promise<{
        allowed: boolean;
        info: RateLimitInfo;
    }>;
    getSystemLoad(): Promise<SystemLoadInfo>;
    calculateAdaptiveLimit(baseLimit: number): Promise<number>;
    recordRateLimitMetrics(requestType: string, allowed: boolean, info: RateLimitInfo): void;
    private cleanupOldEntries;
    private simpleHash;
    resetRateLimit(key: string): void;
    clearAllRateLimits(): void;
    getRateLimitStatus(key: string): RateLimitInfo | null;
    getDebugInfo(): {
        totalEntries: number;
        entries: Array<{
            key: string;
            count: number;
            resetTime: number;
        }>;
    };
}
