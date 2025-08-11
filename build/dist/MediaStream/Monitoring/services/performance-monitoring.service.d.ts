import { ConfigService } from '@nestjs/config';
import { CorrelationService } from '../../Correlation/services/correlation.service';
import { PerformanceMetrics } from '../interfaces/monitoring.interface';
import { MonitoringService } from './monitoring.service';
export declare class PerformanceMonitoringService {
    private readonly _configService;
    private readonly _correlationService;
    private readonly monitoringService;
    private readonly _logger;
    private readonly performanceData;
    private readonly config;
    private readonly activeOperations;
    constructor(_configService: ConfigService, _correlationService: CorrelationService, monitoringService: MonitoringService);
    startOperation(operationName: string, metadata?: any): string;
    endOperation(operationId: string, success?: boolean, errorMessage?: string): void;
    trackOperation<T>(operationName: string, operation: () => T, metadata?: any): T;
    trackAsyncOperation<T>(operationName: string, operation: () => Promise<T>, metadata?: any): Promise<T>;
    getPerformanceMetrics(operationName: string, since?: number): PerformanceMetrics[];
    getPerformanceStats(operationName: string, since?: number): {
        totalOperations: number;
        successfulOperations: number;
        failedOperations: number;
        successRate: number;
        averageDuration: number;
        minDuration: number;
        maxDuration: number;
        p50Duration: number;
        p95Duration: number;
        p99Duration: number;
    };
    getTrackedOperations(): string[];
    getActiveOperations(): Array<{
        operationId: string;
        operationName: string;
        startTime: number;
        duration: number;
        metadata?: any;
    }>;
    getPerformanceOverview(since?: number): {
        totalOperations: number;
        averageResponseTime: number;
        successRate: number;
        slowestOperations: Array<{
            name: string;
            avgDuration: number;
        }>;
        mostFrequentOperations: Array<{
            name: string;
            count: number;
        }>;
        errorRates: Array<{
            name: string;
            errorRate: number;
        }>;
    };
    private recordPerformanceMetric;
    private getPercentile;
    private startPerformanceCleanup;
    private cleanupOldPerformanceData;
}
