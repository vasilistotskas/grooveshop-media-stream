import { CacheHealthIndicator } from '@microservice/Cache/indicators/cache-health.indicator';
import { RedisHealthIndicator } from '@microservice/Cache/indicators/redis-health.indicator';
import { ConfigService } from '@microservice/Config/config.service';
import { DiskSpaceHealthIndicator, DiskSpaceInfo } from '@microservice/Health/indicators/disk-space-health.indicator';
import { MemoryHealthIndicator, MemoryInfo } from '@microservice/Health/indicators/memory-health.indicator';
import { HttpHealthIndicator } from '@microservice/HTTP/indicators/http-health.indicator';
import { HttpClientService } from '@microservice/HTTP/services/http-client.service';
import { AlertingHealthIndicator } from '@microservice/Monitoring/indicators/alerting-health.indicator';
import { SystemHealthIndicator } from '@microservice/Monitoring/indicators/system-health.indicator';
import { JobQueueHealthIndicator } from '@microservice/Queue/indicators/job-queue-health.indicator';
import { StorageHealthIndicator } from '@microservice/Storage/indicators/storage-health.indicator';
import { HealthCheckResult, HealthCheckService, HealthCheckStatus, HealthIndicatorResult } from '@nestjs/terminus';
export declare class HealthController {
    private readonly health;
    private readonly diskSpaceIndicator;
    private readonly memoryIndicator;
    private readonly httpHealthIndicator;
    private readonly cacheHealthIndicator;
    private readonly redisHealthIndicator;
    private readonly alertingHealthIndicator;
    private readonly systemHealthIndicator;
    private readonly jobQueueHealthIndicator;
    private readonly storageHealthIndicator;
    private readonly _configService;
    private readonly httpClientService;
    constructor(health: HealthCheckService, diskSpaceIndicator: DiskSpaceHealthIndicator, memoryIndicator: MemoryHealthIndicator, httpHealthIndicator: HttpHealthIndicator, cacheHealthIndicator: CacheHealthIndicator, redisHealthIndicator: RedisHealthIndicator, alertingHealthIndicator: AlertingHealthIndicator, systemHealthIndicator: SystemHealthIndicator, jobQueueHealthIndicator: JobQueueHealthIndicator, storageHealthIndicator: StorageHealthIndicator, _configService: ConfigService, httpClientService: HttpClientService);
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
    circuitBreakerStatus(): Promise<{
        timestamp: string;
        circuitBreaker: {
            isOpen: boolean;
            stats: any;
        };
        httpClient: {
            stats: any;
        };
    }>;
    resetCircuitBreaker(): Promise<{
        timestamp: string;
        message: string;
        previousState: any;
    }>;
}
