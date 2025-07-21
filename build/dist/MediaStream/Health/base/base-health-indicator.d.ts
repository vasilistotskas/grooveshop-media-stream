import { Logger } from '@nestjs/common';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import type { IHealthIndicator, HealthCheckOptions, HealthMetrics } from '../interfaces/health-indicator.interface';
export declare abstract class BaseHealthIndicator implements IHealthIndicator {
    readonly key: string;
    protected readonly logger: Logger;
    protected readonly options: HealthCheckOptions;
    private lastCheck?;
    constructor(key: string, options?: HealthCheckOptions);
    isHealthy(): Promise<HealthIndicatorResult>;
    getDetails(): Record<string, any>;
    getLastCheck(): HealthMetrics | undefined;
    protected abstract performHealthCheck(): Promise<HealthIndicatorResult>;
    protected abstract getDescription(): string;
    protected createHealthyResult(details?: Record<string, any>): HealthIndicatorResult;
    protected createUnhealthyResult(message: string, details?: Record<string, any>): HealthIndicatorResult;
    protected executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs?: number): Promise<T>;
}
