import { ConfigService } from '@microservice/Config/config.service';
import { OnModuleInit } from '@nestjs/common';
export declare class RateLimitMetricsService implements OnModuleInit {
    private readonly _configService;
    private readonly _logger;
    private readonly register;
    private readonly rateLimitAttemptsTotal;
    private readonly rateLimitBlockedTotal;
    private readonly rateLimitCurrentRequests;
    private readonly rateLimitAdaptiveAdjustments;
    private readonly rateLimitSystemLoad;
    constructor(_configService: ConfigService);
    onModuleInit(): Promise<void>;
    recordRateLimitAttempt(requestType: string, clientIp: string, allowed: boolean): void;
    updateCurrentRequests(requestType: string, clientIp: string, count: number): void;
    recordAdaptiveAdjustment(adjustmentType: 'increase' | 'decrease', reason: string): void;
    updateSystemLoadMetrics(cpuUsage: number, memoryUsage: number, activeConnections: number): void;
    getRateLimitStats(): Promise<{
        totalAttempts: number;
        totalBlocked: number;
        blockRate: number;
        topBlockedIps: Array<{
            ip: string;
            count: number;
        }>;
        topRequestTypes: Array<{
            type: string;
            count: number;
        }>;
    }>;
    getCurrentRateLimitConfig(): {
        defaultLimit: number;
        imageProcessingLimit: number;
        healthCheckLimit: number;
        windowMs: number;
    };
    private hashIp;
    resetMetrics(): void;
}
