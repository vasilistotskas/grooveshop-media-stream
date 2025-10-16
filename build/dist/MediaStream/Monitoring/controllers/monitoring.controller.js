function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
function _ts_param(paramIndex, decorator) {
    return function(target, key) {
        decorator(target, key, paramIndex);
    };
}
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { AlertService } from "../services/alert.service.js";
import { MonitoringService } from "../services/monitoring.service.js";
import { PerformanceMonitoringService } from "../services/performance-monitoring.service.js";
export class MonitoringController {
    /**
	 * Get system health overview
	 */ async getSystemHealth() {
        return await this.monitoringService.getSystemHealth();
    }
    /**
	 * Get monitoring dashboard data
	 */ async getDashboard(since) {
        const sinceTimestamp = since ? Number.parseInt(since) : Date.now() - 24 * 60 * 60 * 1000;
        const [systemHealth, alertStats, performanceOverview, monitoringStats] = await Promise.all([
            this.monitoringService.getSystemHealth(),
            this.alertService.getAlertStats(),
            this.performanceService.getPerformanceOverview(sinceTimestamp),
            this.monitoringService.getStats()
        ]);
        return {
            timestamp: Date.now(),
            systemHealth,
            alerts: {
                ...alertStats,
                activeAlerts: this.alertService.getActiveAlerts()
            },
            performance: performanceOverview,
            monitoring: monitoringStats
        };
    }
    /**
	 * Get metrics by name
	 */ getMetrics(name, since, aggregated) {
        const sinceTimestamp = since ? Number.parseInt(since) : undefined;
        if (aggregated === 'true' && sinceTimestamp !== undefined) {
            return this.monitoringService.getAggregatedMetrics(name, sinceTimestamp);
        }
        return {
            name,
            metrics: this.monitoringService.getMetrics(name, sinceTimestamp)
        };
    }
    /**
	 * Get all metric names
	 */ getMetricNames() {
        return {
            metrics: this.monitoringService.getMetricNames()
        };
    }
    /**
	 * Get alert rules
	 */ getAlertRules() {
        return {
            rules: this.alertService.getAlertRules()
        };
    }
    /**
	 * Add or update alert rule
	 */ addAlertRule(rule) {
        this.alertService.addAlertRule(rule);
        return {
            success: true,
            message: 'Alert rule added successfully'
        };
    }
    /**
	 * Get active alerts
	 */ getActiveAlerts() {
        return {
            alerts: this.alertService.getActiveAlerts()
        };
    }
    /**
	 * Get alert history
	 */ getAlertHistory(since) {
        const sinceTimestamp = since ? Number.parseInt(since) : undefined;
        return {
            alerts: this.alertService.getAlertHistory(sinceTimestamp)
        };
    }
    /**
	 * Trigger manual alert
	 */ triggerAlert(alertData) {
        this.alertService.triggerAlert(alertData.ruleName, alertData.message, alertData.severity, alertData.metadata);
        return {
            success: true,
            message: 'Alert triggered successfully'
        };
    }
    /**
	 * Resolve alert
	 */ resolveAlert(alertId) {
        const resolved = this.alertService.resolveAlert(alertId);
        return {
            success: resolved,
            message: resolved ? 'Alert resolved successfully' : 'Alert not found or already resolved'
        };
    }
    /**
	 * Get performance metrics for an operation
	 */ getPerformanceMetrics(operationName, since, stats) {
        const sinceTimestamp = since ? Number.parseInt(since) : undefined;
        if (stats === 'true') {
            return this.performanceService.getPerformanceStats(operationName, sinceTimestamp);
        }
        return {
            operationName,
            metrics: this.performanceService.getPerformanceMetrics(operationName, sinceTimestamp)
        };
    }
    /**
	 * Get all tracked operations
	 */ getTrackedOperations() {
        return {
            operations: this.performanceService.getTrackedOperations(),
            activeOperations: this.performanceService.getActiveOperations()
        };
    }
    /**
	 * Get performance overview
	 */ getPerformanceOverview(since) {
        const sinceTimestamp = since ? Number.parseInt(since) : undefined;
        return this.performanceService.getPerformanceOverview(sinceTimestamp);
    }
    /**
	 * Get monitoring statistics
	 */ getMonitoringStats() {
        return {
            monitoring: this.monitoringService.getStats(),
            alerts: this.alertService.getAlertStats()
        };
    }
    constructor(monitoringService, alertService, performanceService){
        this.monitoringService = monitoringService;
        this.alertService = alertService;
        this.performanceService = performanceService;
    }
}
_ts_decorate([
    Get('health'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], MonitoringController.prototype, "getSystemHealth", null);
_ts_decorate([
    Get('dashboard'),
    _ts_param(0, Query('since')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], MonitoringController.prototype, "getDashboard", null);
_ts_decorate([
    Get('metrics/:name'),
    _ts_param(0, Param('name')),
    _ts_param(1, Query('since')),
    _ts_param(2, Query('aggregated')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String,
        String,
        String
    ]),
    _ts_metadata("design:returntype", Object)
], MonitoringController.prototype, "getMetrics", null);
_ts_decorate([
    Get('metrics'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Object)
], MonitoringController.prototype, "getMetricNames", null);
_ts_decorate([
    Get('alerts/rules'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Object)
], MonitoringController.prototype, "getAlertRules", null);
_ts_decorate([
    Post('alerts/rules'),
    HttpCode(HttpStatus.CREATED),
    _ts_param(0, Body()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AlertRule === "undefined" ? Object : AlertRule
    ]),
    _ts_metadata("design:returntype", Object)
], MonitoringController.prototype, "addAlertRule", null);
_ts_decorate([
    Get('alerts/active'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Object)
], MonitoringController.prototype, "getActiveAlerts", null);
_ts_decorate([
    Get('alerts/history'),
    _ts_param(0, Query('since')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String
    ]),
    _ts_metadata("design:returntype", Object)
], MonitoringController.prototype, "getAlertHistory", null);
_ts_decorate([
    Post('alerts/trigger'),
    HttpCode(HttpStatus.CREATED),
    _ts_param(0, Body()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        Object
    ]),
    _ts_metadata("design:returntype", Object)
], MonitoringController.prototype, "triggerAlert", null);
_ts_decorate([
    Post('alerts/:alertId/resolve'),
    HttpCode(HttpStatus.OK),
    _ts_param(0, Param('alertId')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String
    ]),
    _ts_metadata("design:returntype", Object)
], MonitoringController.prototype, "resolveAlert", null);
_ts_decorate([
    Get('performance/:operationName'),
    _ts_param(0, Param('operationName')),
    _ts_param(1, Query('since')),
    _ts_param(2, Query('stats')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String,
        String,
        String
    ]),
    _ts_metadata("design:returntype", Object)
], MonitoringController.prototype, "getPerformanceMetrics", null);
_ts_decorate([
    Get('performance'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Object)
], MonitoringController.prototype, "getTrackedOperations", null);
_ts_decorate([
    Get('performance/overview'),
    _ts_param(0, Query('since')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String
    ]),
    _ts_metadata("design:returntype", Object)
], MonitoringController.prototype, "getPerformanceOverview", null);
_ts_decorate([
    Get('stats'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Object)
], MonitoringController.prototype, "getMonitoringStats", null);
MonitoringController = _ts_decorate([
    Controller('monitoring'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof MonitoringService === "undefined" ? Object : MonitoringService,
        typeof AlertService === "undefined" ? Object : AlertService,
        typeof PerformanceMonitoringService === "undefined" ? Object : PerformanceMonitoringService
    ])
], MonitoringController);

//# sourceMappingURL=monitoring.controller.js.map