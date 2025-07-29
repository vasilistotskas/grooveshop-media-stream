"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertingHealthIndicator = void 0;
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const monitoring_interface_1 = require("../interfaces/monitoring.interface");
const alert_service_1 = require("../services/alert.service");
let AlertingHealthIndicator = class AlertingHealthIndicator {
    constructor(alertService, healthIndicatorService) {
        this.alertService = alertService;
        this.healthIndicatorService = healthIndicatorService;
    }
    get key() {
        return 'alerting';
    }
    async isHealthy(key = 'alerting') {
        try {
            const alertStats = this.alertService.getAlertStats();
            const activeAlerts = this.alertService.getActiveAlerts();
            const criticalAlerts = activeAlerts.filter(alert => alert.severity === monitoring_interface_1.AlertSeverity.CRITICAL);
            const highAlerts = activeAlerts.filter(alert => alert.severity === monitoring_interface_1.AlertSeverity.HIGH);
            const isHealthy = criticalAlerts.length === 0 && highAlerts.length < 3;
            const details = {
                totalRules: alertStats.totalRules,
                activeAlerts: alertStats.activeAlerts,
                criticalAlerts: criticalAlerts.length,
                highAlerts: highAlerts.length,
                alertsBySeverity: alertStats.alertsBySeverity,
                alertsLast24h: alertStats.alertsLast24h,
                averageResolutionTime: alertStats.averageResolutionTime,
                recentCriticalAlerts: criticalAlerts.slice(0, 5).map(alert => ({
                    id: alert.id,
                    ruleName: alert.ruleName,
                    message: alert.message,
                    timestamp: alert.timestamp,
                })),
            };
            if (!isHealthy) {
                const message = criticalAlerts.length > 0
                    ? `${criticalAlerts.length} critical alerts active`
                    : `${highAlerts.length} high severity alerts active`;
                return this.healthIndicatorService.check(key).down({ ...details, message });
            }
            return this.healthIndicatorService.check(key).up(details);
        }
        catch (error) {
            return this.healthIndicatorService.check(key).down({
                error: error.message,
                timestamp: Date.now(),
                message: 'Alerting health check failed',
            });
        }
    }
    async getDetailedStatus() {
        try {
            const alertStats = this.alertService.getAlertStats();
            const activeAlerts = this.alertService.getActiveAlerts();
            const recentAlerts = this.alertService.getAlertHistory(Date.now() - 24 * 60 * 60 * 1000);
            const criticalAlerts = activeAlerts.filter(alert => alert.severity === monitoring_interface_1.AlertSeverity.CRITICAL);
            const healthy = criticalAlerts.length === 0;
            return {
                healthy,
                alertStats,
                activeAlerts,
                recentAlerts: recentAlerts.slice(0, 10),
            };
        }
        catch (error) {
            console.error('Alerting health check failed', error);
            return {
                healthy: false,
                alertStats: null,
                activeAlerts: [],
                recentAlerts: [],
            };
        }
    }
    getAlertSeverityDistribution() {
        const alertStats = this.alertService.getAlertStats();
        return alertStats.alertsBySeverity;
    }
    async checkAlertingSystem() {
        const alertStats = this.alertService.getAlertStats();
        const recentAlerts = this.alertService.getAlertHistory(Date.now() - 60 * 60 * 1000);
        return {
            rulesConfigured: alertStats.totalRules > 0,
            alertsProcessing: true,
            recentActivity: recentAlerts.length > 0 || alertStats.activeAlerts > 0,
        };
    }
    getDescription() {
        return 'Monitors alerting system health including active alerts, alert rules, and system responsiveness';
    }
};
exports.AlertingHealthIndicator = AlertingHealthIndicator;
exports.AlertingHealthIndicator = AlertingHealthIndicator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [alert_service_1.AlertService,
        terminus_1.HealthIndicatorService])
], AlertingHealthIndicator);
//# sourceMappingURL=alerting-health.indicator.js.map