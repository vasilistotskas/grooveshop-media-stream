function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import { AlertSeverity } from "../interfaces/monitoring.interface.js";
import { AlertService } from "../services/alert.service.js";
export class AlertingHealthIndicator {
    get key() {
        return 'alerting';
    }
    async isHealthy(key = 'alerting') {
        try {
            const alertStats = this.alertService.getAlertStats();
            const activeAlerts = this.alertService.getActiveAlerts();
            const criticalAlerts = activeAlerts.filter((alert)=>alert.severity === AlertSeverity.CRITICAL);
            const highAlerts = activeAlerts.filter((alert)=>alert.severity === AlertSeverity.HIGH);
            const isHealthy = criticalAlerts.length === 0 && highAlerts.length < 3;
            const details = {
                totalRules: alertStats.totalRules,
                activeAlerts: alertStats.activeAlerts,
                criticalAlerts: criticalAlerts.length,
                highAlerts: highAlerts.length,
                alertsBySeverity: alertStats.alertsBySeverity,
                alertsLast24h: alertStats.alertsLast24h,
                averageResolutionTime: alertStats.averageResolutionTime,
                recentCriticalAlerts: criticalAlerts.slice(0, 5).map((alert)=>({
                        id: alert.id,
                        ruleName: alert.ruleName,
                        message: alert.message,
                        timestamp: alert.timestamp
                    }))
            };
            if (!isHealthy) {
                const message = criticalAlerts.length > 0 ? `${criticalAlerts.length} critical alerts active` : `${highAlerts.length} high severity alerts active`;
                return this.healthIndicatorService.check(key).down({
                    ...details,
                    message
                });
            }
            return this.healthIndicatorService.check(key).up(details);
        } catch (error) {
            return this.healthIndicatorService.check(key).down({
                error: error.message,
                timestamp: Date.now(),
                message: 'Alerting health check failed'
            });
        }
    }
    /**
	 * Get detailed alerting status
	 */ async getDetailedStatus() {
        try {
            const alertStats = this.alertService.getAlertStats();
            const activeAlerts = this.alertService.getActiveAlerts();
            const recentAlerts = this.alertService.getAlertHistory(Date.now() - 24 * 60 * 60 * 1000);
            const criticalAlerts = activeAlerts.filter((alert)=>alert.severity === AlertSeverity.CRITICAL);
            const healthy = criticalAlerts.length === 0;
            return {
                healthy,
                alertStats,
                activeAlerts,
                recentAlerts: recentAlerts.slice(0, 10)
            };
        } catch (error) {
            console.error('Alerting health check failed', error);
            return {
                healthy: false,
                alertStats: null,
                activeAlerts: [],
                recentAlerts: []
            };
        }
    }
    /**
	 * Get alert severity distribution
	 */ getAlertSeverityDistribution() {
        const alertStats = this.alertService.getAlertStats();
        return alertStats.alertsBySeverity;
    }
    /**
	 * Check if alerting system is functioning properly
	 */ async checkAlertingSystem() {
        const alertStats = this.alertService.getAlertStats();
        const recentAlerts = this.alertService.getAlertHistory(Date.now() - 60 * 60 * 1000);
        return {
            rulesConfigured: alertStats.totalRules > 0,
            alertsProcessing: true,
            recentActivity: recentAlerts.length > 0 || alertStats.activeAlerts > 0
        };
    }
    /**
	 * Get health indicator description
	 */ getDescription() {
        return 'Monitors alerting system health including active alerts, alert rules, and system responsiveness';
    }
    constructor(alertService, healthIndicatorService){
        this.alertService = alertService;
        this.healthIndicatorService = healthIndicatorService;
    }
}
AlertingHealthIndicator = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AlertService === "undefined" ? Object : AlertService,
        typeof HealthIndicatorService === "undefined" ? Object : HealthIndicatorService
    ])
], AlertingHealthIndicator);

//# sourceMappingURL=alerting-health.indicator.js.map