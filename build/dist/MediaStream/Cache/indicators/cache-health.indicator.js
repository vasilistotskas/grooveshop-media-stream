function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { ConfigService } from "../../Config/config.service.js";
import { CorrelatedLogger } from "../../Correlation/utils/logger.util.js";
import { BaseHealthIndicator } from "../../Health/base/base-health-indicator.js";
import { Injectable } from "@nestjs/common";
import { CacheWarmingService } from "../services/cache-warming.service.js";
import { MemoryCacheService } from "../services/memory-cache.service.js";
export class CacheHealthIndicator extends BaseHealthIndicator {
    constructor(memoryCacheService, cacheWarmingService, _configService){
        super('cache'), this.memoryCacheService = memoryCacheService, this.cacheWarmingService = cacheWarmingService, this._configService = _configService;
    }
    async performHealthCheck() {
        const startTime = Date.now();
        try {
            const testKey = 'health-check-test';
            const testValue = {
                timestamp: Date.now(),
                test: true
            };
            await this.memoryCacheService.set(testKey, testValue, 60);
            const retrievedValue = await this.memoryCacheService.get(testKey);
            if (!retrievedValue || retrievedValue.timestamp !== testValue.timestamp) {
                throw new Error('Cache GET operation failed');
            }
            await this.memoryCacheService.delete(testKey);
            const deletedValue = await this.memoryCacheService.get(testKey);
            if (deletedValue !== null) {
                throw new Error('Cache DELETE operation failed');
            }
            const stats = await this.memoryCacheService.getStats();
            const memoryUsage = this.memoryCacheService.getMemoryUsage();
            const warmupStats = await this.cacheWarmingService.getWarmupStats();
            const memoryUsagePercent = memoryUsage.used / memoryUsage.total * 100;
            const memoryThreshold = this._configService.get('cache.memory.warningThreshold') || 80;
            const responseTime = Date.now() - startTime;
            const isHealthy = responseTime < 100 && memoryUsagePercent < 90;
            const result = {
                [this.key]: {
                    status: isHealthy ? 'up' : 'down',
                    responseTime: `${responseTime}ms`,
                    memory: {
                        used: memoryUsage.used,
                        total: memoryUsage.total,
                        usagePercent: Math.round(memoryUsagePercent * 100) / 100,
                        warning: memoryUsagePercent > memoryThreshold
                    },
                    statistics: {
                        hits: stats.hits,
                        misses: stats.misses,
                        hitRate: Math.round(stats.hitRate * 10000) / 100,
                        keys: stats.keys,
                        keySize: stats.ksize,
                        valueSize: stats.vsize
                    },
                    warming: {
                        enabled: warmupStats.enabled,
                        filesWarmed: warmupStats.filesWarmed,
                        cacheSize: warmupStats.cacheSize
                    },
                    thresholds: {
                        responseTime: '100ms',
                        memoryUsage: `${memoryThreshold}%`,
                        hitRate: '70%'
                    },
                    warnings: this.generateWarnings(stats, memoryUsagePercent, memoryThreshold)
                }
            };
            if (isHealthy) {
                CorrelatedLogger.debug(`Cache health check passed in ${responseTime}ms`, CacheHealthIndicator.name);
            } else {
                CorrelatedLogger.warn(`Cache health check failed: response time ${responseTime}ms, memory usage ${memoryUsagePercent}%`, CacheHealthIndicator.name);
            }
            return result;
        } catch (error) {
            const responseTime = Date.now() - startTime;
            CorrelatedLogger.error(`Cache health check failed: ${error.message}`, error.stack, CacheHealthIndicator.name);
            return {
                [this.key]: {
                    status: 'down',
                    error: error.message,
                    responseTime: `${responseTime}ms`,
                    lastCheck: new Date().toISOString()
                }
            };
        }
    }
    generateWarnings(stats, memoryUsagePercent, memoryThreshold) {
        const warnings = [];
        if (memoryUsagePercent > memoryThreshold) {
            warnings.push(`Memory usage (${memoryUsagePercent}%) exceeds threshold (${memoryThreshold}%)`);
        }
        if (stats.hitRate < 0.7) {
            warnings.push(`Cache hit rate (${Math.round(stats.hitRate * 100)}%) is below optimal (70%)`);
        }
        if (stats.keys > 900) {
            warnings.push(`Cache key count (${stats.keys}) is approaching limit`);
        }
        return warnings;
    }
    async getDetailedStatus() {
        try {
            const stats = await this.memoryCacheService.getStats();
            const memoryUsage = this.memoryCacheService.getMemoryUsage();
            const warmupStats = await this.cacheWarmingService.getWarmupStats();
            const keys = await this.memoryCacheService.keys();
            return {
                type: 'memory-cache',
                status: 'operational',
                statistics: stats,
                memory: memoryUsage,
                warming: warmupStats,
                configuration: {
                    maxKeys: this._configService.get('cache.memory.maxKeys') || 1000,
                    defaultTtl: this._configService.get('cache.memory.defaultTtl') || 3600,
                    checkPeriod: this._configService.get('cache.memory.checkPeriod') || 600
                },
                recentKeys: keys.slice(0, 10),
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            return {
                type: 'memory-cache',
                status: 'error',
                error: error.message,
                lastUpdated: new Date().toISOString()
            };
        }
    }
    getDescription() {
        return 'Memory cache health indicator that tests cache operations and monitors memory usage';
    }
}
CacheHealthIndicator = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof MemoryCacheService === "undefined" ? Object : MemoryCacheService,
        typeof CacheWarmingService === "undefined" ? Object : CacheWarmingService,
        typeof ConfigService === "undefined" ? Object : ConfigService
    ])
], CacheHealthIndicator);

//# sourceMappingURL=cache-health.indicator.js.map