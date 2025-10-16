function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import * as process from "node:process";
import { CorrelationService } from "../../Correlation/services/correlation.service.js";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AlertCondition, AlertSeverity } from "../interfaces/monitoring.interface.js";
import { MonitoringService } from "./monitoring.service.js";
export class AlertService {
    /**
	 * Add or update an alert rule
	 */ addAlertRule(rule) {
        this.alertRules.set(rule.id, rule);
        this._logger.log(`Alert rule added: ${rule.name}`, {
            correlationId: this._correlationService.getCorrelationId(),
            ruleId: rule.id
        });
    }
    /**
	 * Remove an alert rule
	 */ removeAlertRule(ruleId) {
        const removed = this.alertRules.delete(ruleId);
        if (removed) {
            this._logger.log(`Alert rule removed: ${ruleId}`);
        }
        return removed;
    }
    /**
	 * Get all alert rules
	 */ getAlertRules() {
        return Array.from(this.alertRules.values());
    }
    /**
	 * Get active alerts
	 */ getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }
    /**
	 * Get alert history
	 */ getAlertHistory(since) {
        if (since) {
            return this.alertHistory.filter((alert)=>alert.timestamp >= since);
        }
        return [
            ...this.alertHistory
        ];
    }
    /**
	 * Manually trigger an alert
	 */ triggerAlert(ruleName, message, severity, metadata) {
        const alert = {
            id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ruleId: 'manual',
            ruleName,
            message,
            severity,
            timestamp: Date.now(),
            resolved: false,
            metadata
        };
        this.processAlert(alert);
    }
    /**
	 * Resolve an alert
	 */ resolveAlert(alertId) {
        const alert = this.activeAlerts.get(alertId);
        if (alert && !alert.resolved) {
            alert.resolved = true;
            alert.resolvedAt = Date.now();
            this.activeAlerts.delete(alertId);
            const historyAlert = this.alertHistory.find((a)=>a.id === alertId);
            if (historyAlert) {
                historyAlert.resolved = true;
                historyAlert.resolvedAt = alert.resolvedAt;
            }
            this._logger.log(`Alert resolved: ${alert.ruleName}`, {
                correlationId: this._correlationService.getCorrelationId(),
                alertId,
                duration: alert.resolvedAt - alert.timestamp
            });
            return true;
        }
        return false;
    }
    /**
	 * Manually evaluate alerts (for testing)
	 */ evaluateAlertsNow() {
        this.evaluateAlerts();
    }
    /**
	 * Get alert statistics
	 */ getAlertStats() {
        const activeAlerts = this.getActiveAlerts();
        const last24h = Date.now() - 24 * 60 * 60 * 1000;
        const recentAlerts = this.getAlertHistory(last24h);
        const alertsBySeverity = {
            [AlertSeverity.LOW]: 0,
            [AlertSeverity.MEDIUM]: 0,
            [AlertSeverity.HIGH]: 0,
            [AlertSeverity.CRITICAL]: 0
        };
        activeAlerts.forEach((alert)=>{
            alertsBySeverity[alert.severity]++;
        });
        const resolvedAlerts = this.alertHistory.filter((a)=>a.resolved && a.resolvedAt);
        const totalResolutionTime = resolvedAlerts.reduce((sum, alert)=>{
            return sum + (alert.resolvedAt - alert.timestamp);
        }, 0);
        const averageResolutionTime = resolvedAlerts.length > 0 ? totalResolutionTime / resolvedAlerts.length : 0;
        return {
            totalRules: this.alertRules.size,
            activeAlerts: activeAlerts.length,
            alertsBySeverity,
            alertsLast24h: recentAlerts.length,
            averageResolutionTime
        };
    }
    /**
	 * Initialize default alert rules
	 */ initializeDefaultRules() {
        const defaultRules = [
            {
                id: 'high-memory-usage',
                name: 'High Memory Usage',
                description: 'Memory usage is above 85%',
                metric: 'system.memory.usage_percent',
                condition: AlertCondition.GREATER_THAN,
                threshold: 85,
                severity: AlertSeverity.HIGH,
                enabled: true,
                cooldownMs: this.config.alertCooldownMs
            },
            {
                id: 'critical-memory-usage',
                name: 'Critical Memory Usage',
                description: 'Memory usage is above 95%',
                metric: 'system.memory.usage_percent',
                condition: AlertCondition.GREATER_THAN,
                threshold: 95,
                severity: AlertSeverity.CRITICAL,
                enabled: true,
                cooldownMs: this.config.alertCooldownMs
            }
        ];
        defaultRules.forEach((rule)=>this.addAlertRule(rule));
    }
    /**
	 * Start periodic alert evaluation
	 */ startAlertEvaluation() {
        const evaluationInterval = 30 * 1000;
        setInterval(()=>{
            this.evaluateAlerts();
        }, evaluationInterval);
    }
    /**
	 * Evaluate all alert rules
	 */ evaluateAlerts() {
        const now = Date.now();
        const evaluationWindow = 5 * 60 * 1000;
        for (const rule of this.alertRules.values()){
            if (!rule.enabled) continue;
            const lastAlert = this.alertCooldowns.get(rule.id);
            if (lastAlert && now - lastAlert < rule.cooldownMs) {
                continue;
            }
            try {
                const shouldAlert = this.evaluateRule(rule, evaluationWindow);
                if (shouldAlert) {
                    this.createAlert(rule);
                    this.alertCooldowns.set(rule.id, now);
                }
            } catch (error) {
                this._logger.error(`Error evaluating alert rule ${rule.name}:`, error);
            }
        }
    }
    /**
	 * Evaluate a single alert rule
	 */ evaluateRule(rule, windowMs) {
        const since = Date.now() - windowMs;
        const aggregatedMetrics = this.monitoringService.getAggregatedMetrics(rule.metric, since);
        if (aggregatedMetrics.count === 0) {
            return false;
        }
        const value = aggregatedMetrics.latest;
        switch(rule.condition){
            case AlertCondition.GREATER_THAN:
                return value > rule.threshold;
            case AlertCondition.LESS_THAN:
                return value < rule.threshold;
            case AlertCondition.EQUALS:
                return value === rule.threshold;
            case AlertCondition.NOT_EQUALS:
                return value !== rule.threshold;
            case AlertCondition.GREATER_THAN_OR_EQUAL:
                return value >= rule.threshold;
            case AlertCondition.LESS_THAN_OR_EQUAL:
                return value <= rule.threshold;
            default:
                return false;
        }
    }
    /**
	 * Create an alert from a rule
	 */ createAlert(rule) {
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
                tags: rule.tags
            }
        };
        this.processAlert(alert);
    }
    /**
	 * Process an alert (add to active alerts and history)
	 */ processAlert(alert) {
        this.activeAlerts.set(alert.id, alert);
        this.alertHistory.push(alert);
        this._logger.warn(`Alert triggered: ${alert.ruleName}`, {
            correlationId: this._correlationService.getCorrelationId(),
            alert
        });
    }
    /**
	 * Start alert cleanup process
	 */ startAlertCleanup() {
        const cleanupInterval = 60 * 60 * 1000;
        setInterval(()=>{
            this.cleanupOldAlerts();
        }, cleanupInterval);
    }
    /**
	 * Clean up old alerts based on retention policy
	 */ cleanupOldAlerts() {
        const cutoffTime = Date.now() - this.config.alertsRetentionMs;
        const originalLength = this.alertHistory.length;
        const filteredHistory = this.alertHistory.filter((alert)=>alert.timestamp >= cutoffTime);
        this.alertHistory.splice(0, this.alertHistory.length, ...filteredHistory);
        const removedCount = originalLength - this.alertHistory.length;
        if (removedCount > 0) {
            this._logger.debug(`Cleaned up ${removedCount} old alerts`);
        }
    }
    constructor(_configService, _correlationService, monitoringService){
        this._configService = _configService;
        this._correlationService = _correlationService;
        this.monitoringService = monitoringService;
        this._logger = new Logger(AlertService.name);
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
                endpoints: []
            }
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
}
AlertService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ConfigService === "undefined" ? Object : ConfigService,
        typeof CorrelationService === "undefined" ? Object : CorrelationService,
        typeof MonitoringService === "undefined" ? Object : MonitoringService
    ])
], AlertService);

//# sourceMappingURL=alert.service.js.map