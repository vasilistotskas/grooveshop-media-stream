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
var PerformanceMonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMonitoringService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const correlation_service_1 = require("../../Correlation/services/correlation.service");
const monitoring_service_1 = require("./monitoring.service");
let PerformanceMonitoringService = PerformanceMonitoringService_1 = class PerformanceMonitoringService {
    constructor(configService, correlationService, monitoringService) {
        this.configService = configService;
        this.correlationService = correlationService;
        this.monitoringService = monitoringService;
        this.logger = new common_1.Logger(PerformanceMonitoringService_1.name);
        this.performanceData = new Map();
        this.activeOperations = new Map();
        this.config = this.configService.get('monitoring', {
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
            this.startPerformanceCleanup();
            this.logger.log('Performance monitoring service initialized');
        }
    }
    startOperation(operationName, metadata) {
        if (!this.config.enabled)
            return '';
        const operationId = `${operationName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.activeOperations.set(operationId, {
            startTime: Date.now(),
            metadata,
        });
        this.logger.debug(`Started tracking operation: ${operationName}`, {
            correlationId: this.correlationService.getCorrelationId(),
            operationId,
            operationName,
        });
        return operationId;
    }
    endOperation(operationId, success = true, errorMessage) {
        if (!this.config.enabled || !operationId)
            return;
        const operation = this.activeOperations.get(operationId);
        if (!operation) {
            this.logger.warn(`Operation not found: ${operationId}`);
            return;
        }
        const duration = Date.now() - operation.startTime;
        const operationName = operationId.replace(/-\d+-[a-z0-9]+$/, '');
        const performanceMetric = {
            operationName,
            duration,
            timestamp: Date.now(),
            success,
            errorMessage,
            metadata: operation.metadata,
        };
        this.recordPerformanceMetric(performanceMetric);
        this.activeOperations.delete(operationId);
        this.monitoringService.recordTimer(`performance.${operationName}.duration`, duration);
        this.monitoringService.incrementCounter(`performance.${operationName}.total`);
        if (success) {
            this.monitoringService.incrementCounter(`performance.${operationName}.success`);
        }
        else {
            this.monitoringService.incrementCounter(`performance.${operationName}.error`);
        }
        this.logger.debug(`Completed operation: ${operationName}`, {
            correlationId: this.correlationService.getCorrelationId(),
            operationId,
            duration,
            success,
        });
    }
    trackOperation(operationName, operation, metadata) {
        const operationId = this.startOperation(operationName, metadata);
        try {
            const result = operation();
            this.endOperation(operationId, true);
            return result;
        }
        catch (error) {
            this.endOperation(operationId, false, error.message || error.toString());
            throw error;
        }
    }
    async trackAsyncOperation(operationName, operation, metadata) {
        const operationId = this.startOperation(operationName, metadata);
        try {
            const result = await operation();
            this.endOperation(operationId, true);
            return result;
        }
        catch (error) {
            this.endOperation(operationId, false, error.message || error.toString());
            throw error;
        }
    }
    getPerformanceMetrics(operationName, since) {
        const metrics = this.performanceData.get(operationName) || [];
        if (since) {
            return metrics.filter(m => m.timestamp >= since);
        }
        return [...metrics];
    }
    getPerformanceStats(operationName, since) {
        const metrics = this.getPerformanceMetrics(operationName, since);
        if (metrics.length === 0) {
            return {
                totalOperations: 0,
                successfulOperations: 0,
                failedOperations: 0,
                successRate: 0,
                averageDuration: 0,
                minDuration: 0,
                maxDuration: 0,
                p50Duration: 0,
                p95Duration: 0,
                p99Duration: 0,
            };
        }
        const successful = metrics.filter(m => m.success);
        const failed = metrics.filter(m => !m.success);
        const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
        const totalDuration = durations.reduce((sum, d) => sum + d, 0);
        return {
            totalOperations: metrics.length,
            successfulOperations: successful.length,
            failedOperations: failed.length,
            successRate: (successful.length / metrics.length) * 100,
            averageDuration: totalDuration / metrics.length,
            minDuration: durations[0] || 0,
            maxDuration: durations[durations.length - 1] || 0,
            p50Duration: this.getPercentile(durations, 50),
            p95Duration: this.getPercentile(durations, 95),
            p99Duration: this.getPercentile(durations, 99),
        };
    }
    getTrackedOperations() {
        return Array.from(this.performanceData.keys());
    }
    getActiveOperations() {
        const now = Date.now();
        const activeOps = [];
        for (const [operationId, operation] of this.activeOperations.entries()) {
            const operationName = operationId.replace(/-\d+-[a-z0-9]+$/, '');
            activeOps.push({
                operationId,
                operationName,
                startTime: operation.startTime,
                duration: now - operation.startTime,
                metadata: operation.metadata,
            });
        }
        return activeOps;
    }
    getPerformanceOverview(since) {
        const operations = this.getTrackedOperations();
        let totalOps = 0;
        let totalDuration = 0;
        let totalSuccessful = 0;
        const operationStats = [];
        for (const operationName of operations) {
            const stats = this.getPerformanceStats(operationName, since);
            totalOps += stats.totalOperations;
            totalDuration += stats.averageDuration * stats.totalOperations;
            totalSuccessful += stats.successfulOperations;
            operationStats.push({
                name: operationName,
                count: stats.totalOperations,
                avgDuration: stats.averageDuration,
                errorRate: 100 - stats.successRate,
            });
        }
        const slowestOperations = [...operationStats]
            .sort((a, b) => b.avgDuration - a.avgDuration)
            .slice(0, 5)
            .map(op => ({ name: op.name, avgDuration: op.avgDuration }));
        const mostFrequentOperations = [...operationStats]
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map(op => ({ name: op.name, count: op.count }));
        const errorRates = [...operationStats]
            .filter(op => op.errorRate > 0)
            .sort((a, b) => b.errorRate - a.errorRate)
            .slice(0, 5)
            .map(op => ({ name: op.name, errorRate: op.errorRate }));
        return {
            totalOperations: totalOps,
            averageResponseTime: totalOps > 0 ? totalDuration / totalOps : 0,
            successRate: totalOps > 0 ? (totalSuccessful / totalOps) * 100 : 0,
            slowestOperations,
            mostFrequentOperations,
            errorRates,
        };
    }
    recordPerformanceMetric(metric) {
        if (!this.performanceData.has(metric.operationName)) {
            this.performanceData.set(metric.operationName, []);
        }
        const metrics = this.performanceData.get(metric.operationName);
        metrics.push(metric);
        const maxMetricsPerOperation = 10000;
        if (metrics.length > maxMetricsPerOperation) {
            metrics.splice(0, metrics.length - maxMetricsPerOperation);
        }
    }
    getPercentile(sortedArray, percentile) {
        if (sortedArray.length === 0)
            return 0;
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
    }
    startPerformanceCleanup() {
        const cleanupInterval = Math.min(this.config.performanceRetentionMs / 10, 60 * 60 * 1000);
        setInterval(() => {
            this.cleanupOldPerformanceData();
        }, cleanupInterval);
    }
    cleanupOldPerformanceData() {
        const cutoffTime = Date.now() - this.config.performanceRetentionMs;
        let removedCount = 0;
        for (const [operationName, metrics] of this.performanceData.entries()) {
            const originalLength = metrics.length;
            const filteredMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
            if (filteredMetrics.length !== originalLength) {
                this.performanceData.set(operationName, filteredMetrics);
                removedCount += originalLength - filteredMetrics.length;
            }
        }
        if (removedCount > 0) {
            this.logger.debug(`Cleaned up ${removedCount} old performance metrics`);
        }
    }
};
exports.PerformanceMonitoringService = PerformanceMonitoringService;
exports.PerformanceMonitoringService = PerformanceMonitoringService = PerformanceMonitoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        correlation_service_1.CorrelationService,
        monitoring_service_1.MonitoringService])
], PerformanceMonitoringService);
//# sourceMappingURL=performance-monitoring.service.js.map