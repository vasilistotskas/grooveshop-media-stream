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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringController = void 0;
const common_1 = require("@nestjs/common");
const alert_service_1 = require("../services/alert.service");
const monitoring_service_1 = require("../services/monitoring.service");
const performance_monitoring_service_1 = require("../services/performance-monitoring.service");
let MonitoringController = class MonitoringController {
    constructor(monitoringService, alertService, performanceService) {
        this.monitoringService = monitoringService;
        this.alertService = alertService;
        this.performanceService = performanceService;
    }
    async getSystemHealth() {
        return await this.monitoringService.getSystemHealth();
    }
    async getDashboard(since) {
        const sinceTimestamp = since ? Number.parseInt(since) : Date.now() - 24 * 60 * 60 * 1000;
        const [systemHealth, alertStats, performanceOverview, monitoringStats] = await Promise.all([
            this.monitoringService.getSystemHealth(),
            this.alertService.getAlertStats(),
            this.performanceService.getPerformanceOverview(sinceTimestamp),
            this.monitoringService.getStats(),
        ]);
        return {
            timestamp: Date.now(),
            systemHealth,
            alerts: {
                ...alertStats,
                activeAlerts: this.alertService.getActiveAlerts(),
            },
            performance: performanceOverview,
            monitoring: monitoringStats,
        };
    }
    getMetrics(name, since, aggregated) {
        const sinceTimestamp = since ? Number.parseInt(since) : undefined;
        if (aggregated === 'true' && sinceTimestamp !== undefined) {
            return this.monitoringService.getAggregatedMetrics(name, sinceTimestamp);
        }
        return {
            name,
            metrics: this.monitoringService.getMetrics(name, sinceTimestamp),
        };
    }
    getMetricNames() {
        return {
            metrics: this.monitoringService.getMetricNames(),
        };
    }
    getAlertRules() {
        return {
            rules: this.alertService.getAlertRules(),
        };
    }
    addAlertRule(rule) {
        this.alertService.addAlertRule(rule);
        return { success: true, message: 'Alert rule added successfully' };
    }
    getActiveAlerts() {
        return {
            alerts: this.alertService.getActiveAlerts(),
        };
    }
    getAlertHistory(since) {
        const sinceTimestamp = since ? Number.parseInt(since) : undefined;
        return {
            alerts: this.alertService.getAlertHistory(sinceTimestamp),
        };
    }
    triggerAlert(alertData) {
        this.alertService.triggerAlert(alertData.ruleName, alertData.message, alertData.severity, alertData.metadata);
        return { success: true, message: 'Alert triggered successfully' };
    }
    resolveAlert(alertId) {
        const resolved = this.alertService.resolveAlert(alertId);
        return {
            success: resolved,
            message: resolved ? 'Alert resolved successfully' : 'Alert not found or already resolved',
        };
    }
    getPerformanceMetrics(operationName, since, stats) {
        const sinceTimestamp = since ? Number.parseInt(since) : undefined;
        if (stats === 'true') {
            return this.performanceService.getPerformanceStats(operationName, sinceTimestamp);
        }
        return {
            operationName,
            metrics: this.performanceService.getPerformanceMetrics(operationName, sinceTimestamp),
        };
    }
    getTrackedOperations() {
        return {
            operations: this.performanceService.getTrackedOperations(),
            activeOperations: this.performanceService.getActiveOperations(),
        };
    }
    getPerformanceOverview(since) {
        const sinceTimestamp = since ? Number.parseInt(since) : undefined;
        return this.performanceService.getPerformanceOverview(sinceTimestamp);
    }
    getMonitoringStats() {
        return {
            monitoring: this.monitoringService.getStats(),
            alerts: this.alertService.getAlertStats(),
        };
    }
};
exports.MonitoringController = MonitoringController;
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "getSystemHealth", null);
__decorate([
    (0, common_1.Get)('dashboard'),
    __param(0, (0, common_1.Query)('since')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "getDashboard", null);
__decorate([
    (0, common_1.Get)('metrics/:name'),
    __param(0, (0, common_1.Param)('name')),
    __param(1, (0, common_1.Query)('since')),
    __param(2, (0, common_1.Query)('aggregated')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Object)
], MonitoringController.prototype, "getMetrics", null);
__decorate([
    (0, common_1.Get)('metrics'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], MonitoringController.prototype, "getMetricNames", null);
__decorate([
    (0, common_1.Get)('alerts/rules'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], MonitoringController.prototype, "getAlertRules", null);
__decorate([
    (0, common_1.Post)('alerts/rules'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], MonitoringController.prototype, "addAlertRule", null);
__decorate([
    (0, common_1.Get)('alerts/active'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], MonitoringController.prototype, "getActiveAlerts", null);
__decorate([
    (0, common_1.Get)('alerts/history'),
    __param(0, (0, common_1.Query)('since')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], MonitoringController.prototype, "getAlertHistory", null);
__decorate([
    (0, common_1.Post)('alerts/trigger'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], MonitoringController.prototype, "triggerAlert", null);
__decorate([
    (0, common_1.Post)('alerts/:alertId/resolve'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('alertId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], MonitoringController.prototype, "resolveAlert", null);
__decorate([
    (0, common_1.Get)('performance/:operationName'),
    __param(0, (0, common_1.Param)('operationName')),
    __param(1, (0, common_1.Query)('since')),
    __param(2, (0, common_1.Query)('stats')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Object)
], MonitoringController.prototype, "getPerformanceMetrics", null);
__decorate([
    (0, common_1.Get)('performance'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], MonitoringController.prototype, "getTrackedOperations", null);
__decorate([
    (0, common_1.Get)('performance/overview'),
    __param(0, (0, common_1.Query)('since')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], MonitoringController.prototype, "getPerformanceOverview", null);
__decorate([
    (0, common_1.Get)('stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], MonitoringController.prototype, "getMonitoringStats", null);
exports.MonitoringController = MonitoringController = __decorate([
    (0, common_1.Controller)('monitoring'),
    __metadata("design:paramtypes", [monitoring_service_1.MonitoringService,
        alert_service_1.AlertService,
        performance_monitoring_service_1.PerformanceMonitoringService])
], MonitoringController);
//# sourceMappingURL=monitoring.controller.js.map