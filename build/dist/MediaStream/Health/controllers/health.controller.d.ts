import { HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { DiskSpaceHealthIndicator, type DiskSpaceInfo } from '../indicators/disk-space-health.indicator';
import { MemoryHealthIndicator, type MemoryInfo } from '../indicators/memory-health.indicator';
import { HttpHealthIndicator } from '@microservice/HTTP/indicators/http-health.indicator';
import { ConfigService } from '@microservice/Config/config.service';
export declare class HealthController {
    private readonly health;
    private readonly diskSpaceIndicator;
    private readonly memoryIndicator;
    private readonly httpHealthIndicator;
    private readonly configService;
    constructor(health: HealthCheckService, diskSpaceIndicator: DiskSpaceHealthIndicator, memoryIndicator: MemoryHealthIndicator, httpHealthIndicator: HttpHealthIndicator, configService: ConfigService);
    check(): Promise<HealthCheckResult>;
    getDetailedHealth(): Promise<{
        status: import("@nestjs/terminus").HealthCheckStatus;
        info: import("@nestjs/terminus").HealthIndicatorResult;
        error: import("@nestjs/terminus").HealthIndicatorResult;
        details: import("@nestjs/terminus").HealthIndicatorResult;
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
                enabled: any;
                metricsPort: any;
            };
            cache: {
                fileDirectory: any;
                memoryMaxSize: any;
            };
        };
    }>;
    readiness(): Promise<{
        status: string;
        timestamp: string;
        checks: import("@nestjs/terminus").HealthIndicatorResult;
        error?: undefined;
    } | {
        status: string;
        timestamp: string;
        error: string;
        checks?: undefined;
    }>;
    liveness(): Promise<{
        status: string;
        timestamp: string;
        uptime: number;
        pid: number;
    }>;
}
