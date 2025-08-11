import { ConfigService } from '@nestjs/config';
import { CorrelationService } from '../../Correlation/services/correlation.service';
import { Alert, AlertRule, AlertSeverity } from '../interfaces/monitoring.interface';
import { MonitoringService } from './monitoring.service';
export declare class AlertService {
    private readonly _configService;
    private readonly _correlationService;
    private readonly monitoringService;
    private readonly _logger;
    private readonly alertRules;
    private readonly activeAlerts;
    private readonly alertHistory;
    private readonly config;
    private readonly alertCooldowns;
    constructor(_configService: ConfigService, _correlationService: CorrelationService, monitoringService: MonitoringService);
    addAlertRule(rule: AlertRule): void;
    removeAlertRule(ruleId: string): boolean;
    getAlertRules(): AlertRule[];
    getActiveAlerts(): Alert[];
    getAlertHistory(since?: number): Alert[];
    triggerAlert(ruleName: string, message: string, severity: AlertSeverity, metadata?: Record<string, any>): void;
    resolveAlert(alertId: string): boolean;
    evaluateAlertsNow(): void;
    getAlertStats(): {
        totalRules: number;
        activeAlerts: number;
        alertsBySeverity: Record<AlertSeverity, number>;
        alertsLast24h: number;
        averageResolutionTime: number;
    };
    private initializeDefaultRules;
    private startAlertEvaluation;
    private evaluateAlerts;
    private evaluateRule;
    private createAlert;
    private processAlert;
    private startAlertCleanup;
    private cleanupOldAlerts;
}
