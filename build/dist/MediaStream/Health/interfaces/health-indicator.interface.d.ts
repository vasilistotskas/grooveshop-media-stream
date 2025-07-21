import type { HealthIndicatorResult } from '@nestjs/terminus';
export interface IHealthIndicator {
    readonly key: string;
    isHealthy(): Promise<HealthIndicatorResult>;
    getDetails(): Record<string, any>;
}
export interface HealthCheckOptions {
    timeout?: number;
    retries?: number;
    threshold?: number;
}
export interface HealthMetrics {
    timestamp: number;
    status: 'healthy' | 'unhealthy' | 'degraded';
    responseTime: number;
    details: Record<string, any>;
}
