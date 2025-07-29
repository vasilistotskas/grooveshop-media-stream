import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { MonitoringService } from '../services/monitoring.service';
export declare class SystemHealthIndicator extends BaseHealthIndicator {
    private readonly monitoringService;
    constructor(monitoringService: MonitoringService);
    protected performHealthCheck(): Promise<HealthIndicatorResult>;
    getDetailedStatus(): Promise<{
        healthy: boolean;
        systemHealth: any;
        monitoringStats: any;
    }>;
    getComponentHealth(componentName: string): Promise<any>;
    protected getDescription(): string;
}
