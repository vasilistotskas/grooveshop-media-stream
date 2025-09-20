import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { AlertSeverity } from '../interfaces/monitoring.interface';
import { AlertService } from '../services/alert.service';
export declare class AlertingHealthIndicator {
    private readonly alertService;
    private readonly healthIndicatorService;
    constructor(alertService: AlertService, healthIndicatorService: HealthIndicatorService);
    get key(): string;
    isHealthy(key?: string): Promise<HealthIndicatorResult>;
    getDetailedStatus(): Promise<{
        healthy: boolean;
        alertStats: any;
        activeAlerts: any[];
        recentAlerts: any[];
    }>;
    getAlertSeverityDistribution(): Record<AlertSeverity, number>;
    checkAlertingSystem(): Promise<{
        rulesConfigured: boolean;
        alertsProcessing: boolean;
        recentActivity: boolean;
    }>;
    getDescription(): string;
}
