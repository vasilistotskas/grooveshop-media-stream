import type { HealthIndicatorResult } from '@nestjs/terminus';
import type { HealthCheckOptions, HealthMetrics, IHealthIndicator } from '../interfaces/health-indicator.interface';
import { Logger } from '@nestjs/common';
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
    protected createUnhealthyResult(message: string, _details?: Record<string, any>): HealthIndicatorResult;
    protected executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs?: number): Promise<T>;
}
