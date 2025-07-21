import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@microservice/Config/config.service';
import * as promClient from 'prom-client';
export declare class MetricsService implements OnModuleInit {
    private readonly configService;
    private readonly logger;
    private readonly register;
    private readonly httpRequestsTotal;
    private readonly httpRequestDuration;
    private readonly memoryUsage;
    private readonly diskSpaceUsage;
    private readonly cacheHitRatio;
    private readonly activeConnections;
    private readonly imageProcessingDuration;
    private readonly imageProcessingTotal;
    private readonly cacheOperationsTotal;
    private readonly errorTotal;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    getMetrics(): Promise<string>;
    getRegistry(): promClient.Registry;
    recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void;
    recordImageProcessing(operation: string, format: string, status: 'success' | 'error', duration: number): void;
    recordCacheOperation(operation: 'get' | 'set' | 'delete' | 'clear' | 'expire' | 'flush' | 'warmup', cacheType: string, status: 'hit' | 'miss' | 'success' | 'error'): void;
    recordError(type: string, operation: string): void;
    updateMemoryMetrics(memoryInfo: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
    }): void;
    updateDiskSpaceMetrics(path: string, total: number, used: number, free: number): void;
    updateCacheHitRatio(cacheType: string, ratio: number): void;
    updateActiveConnections(type: string, count: number): void;
    reset(): void;
    private startPeriodicMetricsCollection;
    private collectSystemMetrics;
}
