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
var MonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringService = void 0;
const process = __importStar(require("node:process"));
const correlation_service_1 = require("../../Correlation/services/correlation.service");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const monitoring_interface_1 = require("../interfaces/monitoring.interface");
let MonitoringService = MonitoringService_1 = class MonitoringService {
    constructor(_configService, _correlationService) {
        this._configService = _configService;
        this._correlationService = _correlationService;
        this._logger = new common_1.Logger(MonitoringService_1.name);
        this.metrics = new Map();
        this.maxMetricsPerType = 10000;
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
            this.startMetricsCleanup();
            this._logger.log('Monitoring service initialized');
        }
    }
    recordMetric(name, value, type, tags) {
        if (!this.config.enabled)
            return;
        const metric = {
            name,
            value,
            timestamp: Date.now(),
            tags,
            type,
        };
        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
        }
        const metricsList = this.metrics.get(name);
        metricsList.push(metric);
        if (metricsList.length > this.maxMetricsPerType) {
            metricsList.splice(0, metricsList.length - this.maxMetricsPerType);
        }
        this._logger.debug(`Recorded metric: ${name} = ${value}`, {
            correlationId: this._correlationService.getCorrelationId(),
            metric,
        });
    }
    incrementCounter(name, value = 1, tags) {
        this.recordMetric(name, value, monitoring_interface_1.MetricType.COUNTER, tags);
    }
    recordGauge(name, value, tags) {
        this.recordMetric(name, value, monitoring_interface_1.MetricType.GAUGE, tags);
    }
    recordHistogram(name, value, tags) {
        this.recordMetric(name, value, monitoring_interface_1.MetricType.HISTOGRAM, tags);
    }
    recordTimer(name, durationMs, tags) {
        this.recordMetric(name, durationMs, monitoring_interface_1.MetricType.TIMER, tags);
    }
    getMetrics(name, since) {
        const metrics = this.metrics.get(name) || [];
        if (since) {
            return metrics.filter(m => m.timestamp >= since);
        }
        return [...metrics];
    }
    getMetricNames() {
        return Array.from(this.metrics.keys());
    }
    getAggregatedMetrics(name, since) {
        const metrics = this.getMetrics(name, since);
        if (metrics.length === 0) {
            return {
                count: 0,
                sum: 0,
                avg: 0,
                min: 0,
                max: 0,
                latest: 0,
            };
        }
        const values = metrics.map(m => m.value);
        const sum = values.reduce((a, b) => a + b, 0);
        return {
            count: metrics.length,
            sum,
            avg: sum / metrics.length,
            min: Math.min(...values),
            max: Math.max(...values),
            latest: metrics[metrics.length - 1].value,
        };
    }
    async getSystemHealth() {
        const components = [];
        let totalScore = 0;
        const memoryHealth = await this.checkMemoryHealth();
        const diskHealth = await this.checkDiskHealth();
        const networkHealth = await this.checkNetworkHealth();
        const cacheHealth = await this.checkCacheHealth();
        components.push(memoryHealth, diskHealth, networkHealth, cacheHealth);
        totalScore = components.reduce((sum, comp) => sum + comp.score, 0) / components.length;
        let status;
        if (totalScore >= 70) {
            status = 'healthy';
        }
        else if (totalScore >= 50) {
            status = 'degraded';
        }
        else {
            status = 'unhealthy';
        }
        return {
            status,
            timestamp: Date.now(),
            components,
            overallScore: totalScore,
        };
    }
    getStats() {
        let totalMetrics = 0;
        let oldestTimestamp = Date.now();
        let newestTimestamp = 0;
        const metricTypes = {};
        for (const [_name, metrics] of this.metrics.entries()) {
            totalMetrics += metrics.length;
            for (const metric of metrics) {
                metricTypes[metric.type] = (metricTypes[metric.type] || 0) + 1;
                oldestTimestamp = Math.min(oldestTimestamp, metric.timestamp);
                newestTimestamp = Math.max(newestTimestamp, metric.timestamp);
            }
        }
        const avgMetricSize = 200;
        const memoryUsage = totalMetrics * avgMetricSize;
        return {
            totalMetrics,
            metricTypes,
            oldestMetric: oldestTimestamp,
            newestMetric: newestTimestamp,
            memoryUsage,
        };
    }
    startMetricsCleanup() {
        const cleanupInterval = Math.min(this.config.metricsRetentionMs / 10, 60 * 60 * 1000);
        setInterval(() => {
            this.cleanupOldMetrics();
        }, cleanupInterval);
    }
    cleanupOldMetrics() {
        const cutoffTime = Date.now() - this.config.metricsRetentionMs;
        let removedCount = 0;
        for (const [name, metrics] of this.metrics.entries()) {
            const originalLength = metrics.length;
            const filteredMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
            if (filteredMetrics.length !== originalLength) {
                this.metrics.set(name, filteredMetrics);
                removedCount += originalLength - filteredMetrics.length;
            }
        }
        if (removedCount > 0) {
            this._logger.debug(`Cleaned up ${removedCount} old metrics`);
        }
    }
    async checkMemoryHealth() {
        const memUsage = process.memoryUsage();
        const totalMB = memUsage.heapTotal / 1024 / 1024;
        const usedMB = memUsage.heapUsed / 1024 / 1024;
        const usagePercent = (usedMB / totalMB) * 100;
        let score = 100;
        if (usagePercent > 98)
            score = 20;
        else if (usagePercent > 95)
            score = 50;
        else if (usagePercent > 90)
            score = 70;
        else if (usagePercent > 85)
            score = 85;
        return {
            name: 'memory',
            status: score >= 60 ? 'healthy' : score >= 40 ? 'degraded' : 'unhealthy',
            score,
            metrics: {
                totalMB,
                usedMB,
                usagePercent,
            },
            lastCheck: Date.now(),
        };
    }
    async checkDiskHealth() {
        return {
            name: 'disk',
            status: 'healthy',
            score: 90,
            metrics: {
                usagePercent: 45,
                availableGB: 100,
            },
            lastCheck: Date.now(),
        };
    }
    async checkNetworkHealth() {
        return {
            name: 'network',
            status: 'healthy',
            score: 95,
            metrics: {
                latencyMs: 10,
                packetsLost: 0,
            },
            lastCheck: Date.now(),
        };
    }
    async checkCacheHealth() {
        const cacheHits = this.getAggregatedMetrics('cache.hits', Date.now() - 60000);
        const cacheMisses = this.getAggregatedMetrics('cache.misses', Date.now() - 60000);
        const totalRequests = cacheHits.sum + cacheMisses.sum;
        const hitRate = totalRequests > 0 ? (cacheHits.sum / totalRequests) * 100 : 85;
        let score = 100;
        if (hitRate < 20)
            score = 60;
        else if (hitRate < 40)
            score = 70;
        else if (hitRate < 60)
            score = 80;
        else if (hitRate < 80)
            score = 90;
        return {
            name: 'cache',
            status: score >= 60 ? 'healthy' : score >= 40 ? 'degraded' : 'unhealthy',
            score,
            metrics: {
                hitRate,
                hits: cacheHits.sum,
                misses: cacheMisses.sum,
            },
            lastCheck: Date.now(),
        };
    }
};
exports.MonitoringService = MonitoringService;
exports.MonitoringService = MonitoringService = MonitoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        correlation_service_1.CorrelationService])
], MonitoringService);
//# sourceMappingURL=monitoring.service.js.map