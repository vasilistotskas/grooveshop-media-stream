import { CorrelationService } from '@microservice/Correlation/services/correlation.service';
import { ConfigService } from '@nestjs/config';
import { CustomMetric, MetricType, SystemHealth } from '../interfaces/monitoring.interface';
export declare class MonitoringService {
    private readonly _configService;
    private readonly _correlationService;
    private readonly _logger;
    private readonly metrics;
    private readonly config;
    private readonly maxMetricsPerType;
    constructor(_configService: ConfigService, _correlationService: CorrelationService);
    recordMetric(name: string, value: number, type: MetricType, tags?: Record<string, string>): void;
    incrementCounter(name: string, value?: number, tags?: Record<string, string>): void;
    recordGauge(name: string, value: number, tags?: Record<string, string>): void;
    recordHistogram(name: string, value: number, tags?: Record<string, string>): void;
    recordTimer(name: string, durationMs: number, tags?: Record<string, string>): void;
    getMetrics(name: string, since?: number): CustomMetric[];
    getMetricNames(): string[];
    getAggregatedMetrics(name: string, since: number): {
        count: number;
        sum: number;
        avg: number;
        min: number;
        max: number;
        latest: number;
    };
    getSystemHealth(): Promise<SystemHealth>;
    getStats(): {
        totalMetrics: number;
        metricTypes: Record<string, number>;
        oldestMetric: number;
        newestMetric: number;
        memoryUsage: number;
    };
    private startMetricsCleanup;
    private cleanupOldMetrics;
    private checkMemoryHealth;
    private checkDiskHealth;
    private checkNetworkHealth;
    private checkCacheHealth;
}
