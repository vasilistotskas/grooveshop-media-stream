import { RedisHealthIndicator } from '@microservice/Cache/indicators/redis-health.indicator';
import { ConfigService } from '@microservice/Config/config.service';
import { DiskSpaceHealthIndicator, DiskSpaceInfo } from '@microservice/Health/indicators/disk-space-health.indicator';
import { MemoryHealthIndicator, MemoryInfo } from '@microservice/Health/indicators/memory-health.indicator';
import { HttpHealthIndicator } from '@microservice/HTTP/indicators/http-health.indicator';
import { HealthCheckResult, HealthCheckService, HealthCheckStatus, HealthIndicatorResult } from '@nestjs/terminus';
export declare class HealthController {
    private readonly health;
    private readonly diskSpaceIndicator;
    private readonly memoryIndicator;
    private readonly httpHealthIndicator;
    private readonly redisHealthIndicator;
    private readonly configService;
    constructor(health: HealthCheckService, diskSpaceIndicator: DiskSpaceHealthIndicator, memoryIndicator: MemoryHealthIndicator, httpHealthIndicator: HttpHealthIndicator, redisHealthIndicator: RedisHealthIndicator, configService: ConfigService);
    check(): Promise<HealthCheckResult>;
    getDetailedHealth(): Promise<{
        status: HealthCheckStatus;
        info: HealthIndicatorResult;
        error: HealthIndicatorResult;
        details: HealthIndicatorResult;
        timestamp: string;
        uptime: number;
        version: string;
        environment: string;
        systemInfo: {
            platform: NodeJS.Platform;
            arch: NodeJS.Architecture;
            nodeVersion: string;
            pid: number;
        };
        resources: {
            disk: DiskSpaceInfo;
            memory: MemoryInfo;
        };
        configuration: {
            monitoring: {
                enabled: boolean;
                metricsPort: number;
            };
            cache: {
                fileDirectory: string;
                memoryMaxSize: number;
            };
        };
    }>;
    readiness(): Promise<{
        status: string;
        timestamp: string;
        checks?: any;
        error?: string;
    }>;
    liveness(): Promise<{
        status: string;
        timestamp: string;
        uptime: number;
        pid: number;
    }>;
}
