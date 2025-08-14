"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AlertService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertService = void 0;
const process = __importStar(require("node:process"));
const correlation_service_1 = require("../../Correlation/services/correlation.service");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const monitoring_interface_1 = require("../interfaces/monitoring.interface");
const monitoring_service_1 = require("./monitoring.service");
let AlertService = AlertService_1 = class AlertService {
    constructor(_configService, _correlationService, monitoringService) {
        this._configService = _configService;
        this._correlationService = _correlationService;
        this.monitoringService = monitoringService;
        this._logger = new common_1.Logger(AlertService_1.name);
        this.alertRules = new Map();
        this.activeAlerts = new Map();
        this.alertHistory = [];
        this.alertCooldowns = new Map();
        this.config = this._configService.get('monitoring', {
            enabled: true,
            metricsRetentionMs: 24 * 60 * 60 * 1000,
            alertsRetentionMs: 7 * 24 * 60 * 60 * 1000,
            performanceRetentionMs: 24 * 60 * 60 * 1000,
            healthCheckIntervalMs: 30 * 1000,
            alertCooldownMs: 5 * 60 * 1000,
            externalIntegrations: {
                enabled: false,
                endpoints: [],
            },
        });
        if (this.config.enabled) {
            this.initializeDefaultRules();
            if (process.env.NODE_ENV !== 'test') {
                this.startAlertEvaluation();
            }
            this.startAlertCleanup();
            this._logger.log('Alert service initialized');
        }
    }
    addAlertRule(rule) {
        this.alertRules.set(rule.id, rule);
        this._logger.log(`Alert rule added: ${rule.name}`, {
            correlationId: this._correlationService.getCorrelationId(),
            ruleId: rule.id,
        });
    }
    removeAlertRule(ruleId) {
        const removed = this.alertRules.delete(ruleId);
        if (removed) {
            this._logger.log(`Alert rule removed: ${ruleId}`);
        }
        return removed;
    }
    getAlertRules() {
        return Array.from(this.alertRules.values());
    }
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }
    getAlertHistory(since) {
        if (since) {
            return this.alertHistory.filter(alert => alert.timestamp >= since);
        }
        return [...this.alertHistory];
    }
    triggerAlert(ruleName, message, severity, metadata) {
        const alert = {
            id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ruleId: 'manual',
            ruleName,
            message,
            severity,
            timestamp: Date.now(),
            resolved: false,
            metadata,
        };
        this.processAlert(alert);
    }
    resolveAlert(alertId) {
        const alert = this.activeAlerts.get(alertId);
        if (alert && !alert.resolved) {
            alert.resolved = true;
            alert.resolvedAt = Date.now();
            this.activeAlerts.delete(alertId);
            const historyAlert = this.alertHistory.find(a => a.id === alertId);
            if (historyAlert) {
                historyAlert.resolved = true;
                historyAlert.resolvedAt = alert.resolvedAt;
            }
            this._logger.log(`Alert resolved: ${alert.ruleName}`, {
                correlationId: this._correlationService.getCorrelationId(),
                alertId,
                duration: alert.resolvedAt - alert.timestamp,
            });
            return true;
        }
        return false;
    }
    evaluateAlertsNow() {
        this.evaluateAlerts();
    }
    getAlertStats() {
        const activeAlerts = this.getActiveAlerts();
        const last24h = Date.now() - 24 * 60 * 60 * 1000;
        const recentAlerts = this.getAlertHistory(last24h);
        const alertsBySeverity = {
            [monitoring_interface_1.AlertSeverity.LOW]: 0,
            [monitoring_interface_1.AlertSeverity.MEDIUM]: 0,
            [monitoring_interface_1.AlertSeverity.HIGH]: 0,
            [monitoring_interface_1.AlertSeverity.CRITICAL]: 0,
        };
        activeAlerts.forEach((alert) => {
            alertsBySeverity[alert.severity]++;
        });
        const resolvedAlerts = this.alertHistory.filter(a => a.resolved && a.resolvedAt);
        const totalResolutionTime = resolvedAlerts.reduce((sum, alert) => {
            return sum + (alert.resolvedAt - alert.timestamp);
        }, 0);
        const averageResolutionTime = resolvedAlerts.length > 0
            ? totalResolutionTime / resolvedAlerts.length
            : 0;
        return {
            totalRules: this.alertRules.size,
            activeAlerts: activeAlerts.length,
            alertsBySeverity,
            alertsLast24h: recentAlerts.length,
            averageResolutionTime,
        };
    }
    initializeDefaultRules() {
        const defaultRules = [
            {
                id: 'high-memory-usage',
                name: 'High Memory Usage',
                description: 'Memory usage is above 85%',
                metric: 'system.memory.usage_percent',
                condition: monitoring_interface_1.AlertCondition.GREATER_THAN,
                threshold: 85,
                severity: monitoring_interface_1.AlertSeverity.HIGH,
                enabled: true,
                cooldownMs: this.config.alertCooldownMs,
            },
            {
                id: 'critical-memory-usage',
                name: 'Critical Memory Usage',
                description: 'Memory usage is above 95%',
                metric: 'system.memory.usage_percent',
                condition: monitoring_interface_1.AlertCondition.GREATER_THAN,
                threshold: 95,
                severity: monitoring_interface_1.AlertSeverity.CRITICAL,
                enabled: true,
                cooldownMs: this.config.alertCooldownMs,
            },
        ];
        defaultRules.forEach(rule => this.addAlertRule(rule));
    }
    startAlertEvaluation() {
        const evaluationInterval = 30 * 1000;
        setInterval(() => {
            this.evaluateAlerts();
        }, evaluationInterval);
    }
    evaluateAlerts() {
        const now = Date.now();
        const evaluationWindow = 5 * 60 * 1000;
        for (const rule of this.alertRules.values()) {
            if (!rule.enabled)
                continue;
            const lastAlert = this.alertCooldowns.get(rule.id);
            if (lastAlert && (now - lastAlert) < rule.cooldownMs) {
                continue;
            }
            try {
                const shouldAlert = this.evaluateRule(rule, evaluationWindow);
                if (shouldAlert) {
                    this.createAlert(rule);
                    this.alertCooldowns.set(rule.id, now);
                }
            }
            catch (error) {
                this._logger.error(`Error evaluating alert rule ${rule.name}:`, error);
            }
        }
    }
    evaluateRule(rule, windowMs) {
        const since = Date.now() - windowMs;
        const aggregatedMetrics = this.monitoringService.getAggregatedMetrics(rule.metric, since);
        if (aggregatedMetrics.count === 0) {
            return false;
        }
        const value = aggregatedMetrics.latest;
        switch (rule.condition) {
            case monitoring_interface_1.AlertCondition.GREATER_THAN:
                return value > rule.threshold;
            case monitoring_interface_1.AlertCondition.LESS_THAN:
                return value < rule.threshold;
            case monitoring_interface_1.AlertCondition.EQUALS:
                return value === rule.threshold;
            case monitoring_interface_1.AlertCondition.NOT_EQUALS:
                return value !== rule.threshold;
            case monitoring_interface_1.AlertCondition.GREATER_THAN_OR_EQUAL:
                return value >= rule.threshold;
            case monitoring_interface_1.AlertCondition.LESS_THAN_OR_EQUAL:
                return value <= rule.threshold;
            default:
                return false;
        }
    }
    createAlert(rule) {
        const alert = {
            id: `${rule.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ruleId: rule.id,
            ruleName: rule.name,
            message: rule.description,
            severity: rule.severity,
            timestamp: Date.now(),
            resolved: false,
            metadata: {
                metric: rule.metric,
                threshold: rule.threshold,
                condition: rule.condition,
                tags: rule.tags,
            },
        };
        this.processAlert(alert);
    }
    processAlert(alert) {
        this.activeAlerts.set(alert.id, alert);
        this.alertHistory.push(alert);
        this._logger.warn(`Alert triggered: ${alert.ruleName}`, {
            correlationId: this._correlationService.getCorrelationId(),
            alert,
        });
    }
    startAlertCleanup() {
        const cleanupInterval = 60 * 60 * 1000;
        setInterval(() => {
            this.cleanupOldAlerts();
        }, cleanupInterval);
    }
    cleanupOldAlerts() {
        const cutoffTime = Date.now() - this.config.alertsRetentionMs;
        const originalLength = this.alertHistory.length;
        const filteredHistory = this.alertHistory.filter(alert => alert.timestamp >= cutoffTime);
        this.alertHistory.splice(0, this.alertHistory.length, ...filteredHistory);
        const removedCount = originalLength - this.alertHistory.length;
        if (removedCount > 0) {
            this._logger.debug(`Cleaned up ${removedCount} old alerts`);
        }
    }
};
exports.AlertService = AlertService;
exports.AlertService = AlertService = AlertService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        correlation_service_1.CorrelationService,
        monitoring_service_1.MonitoringService])
], AlertService);
//# sourceMappingURL=alert.service.js.map