import { Alert, AlertRule, AlertSeverity, SystemHealth } from '../interfaces/monitoring.interface';
import { AlertService } from '../services/alert.service';
import { MonitoringService } from '../services/monitoring.service';
import { PerformanceMonitoringService } from '../services/performance-monitoring.service';
export declare class MonitoringController {
    private readonly monitoringService;
    private readonly alertService;
    private readonly performanceService;
    constructor(monitoringService: MonitoringService, alertService: AlertService, performanceService: PerformanceMonitoringService);
    getSystemHealth(): Promise<SystemHealth>;
    getDashboard(since?: string): Promise<any>;
    getMetrics(name: string, since?: string, aggregated?: string): any;
    getMetricNames(): {
        metrics: string[];
    };
    getAlertRules(): {
        rules: AlertRule[];
    };
    addAlertRule(rule: AlertRule): {
        success: boolean;
        message: string;
    };
    getActiveAlerts(): {
        alerts: Alert[];
    };
    getAlertHistory(since?: string): {
        alerts: Alert[];
    };
    triggerAlert(alertData: {
        ruleName: string;
        message: string;
        severity: AlertSeverity;
        metadata?: Record<string, any>;
    }): {
        success: boolean;
        message: string;
    };
    resolveAlert(alertId: string): {
        success: boolean;
        message: string;
    };
    getPerformanceMetrics(operationName: string, since?: string, stats?: string): any;
    getTrackedOperations(): {
        operations: string[];
        activeOperations: {
            operationId: string;
            operationName: string;
            startTime: number;
            duration: number;
            metadata?: any;
        }[];
    };
    getPerformanceOverview(since?: string): any;
    getMonitoringStats(): any;
}
