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
var CacheHealthIndicator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheHealthIndicator = void 0;
const common_1 = require("@nestjs/common");
const base_health_indicator_1 = require("../../Health/base/base-health-indicator");
const memory_cache_service_1 = require("../services/memory-cache.service");
const cache_warming_service_1 = require("../services/cache-warming.service");
const config_service_1 = require("../../Config/config.service");
const logger_util_1 = require("../../Correlation/utils/logger.util");
let CacheHealthIndicator = CacheHealthIndicator_1 = class CacheHealthIndicator extends base_health_indicator_1.BaseHealthIndicator {
    constructor(memoryCacheService, cacheWarmingService, configService) {
        super('cache');
        this.memoryCacheService = memoryCacheService;
        this.cacheWarmingService = cacheWarmingService;
        this.configService = configService;
    }
    async performHealthCheck() {
        const startTime = Date.now();
        try {
            const testKey = 'health-check-test';
            const testValue = { timestamp: Date.now(), test: true };
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
            const memoryUsagePercent = (memoryUsage.used / memoryUsage.total) * 100;
            const memoryThreshold = this.configService.get('cache.memory.warningThreshold') || 80;
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
                        warning: memoryUsagePercent > memoryThreshold,
                    },
                    statistics: {
                        hits: stats.hits,
                        misses: stats.misses,
                        hitRate: Math.round(stats.hitRate * 10000) / 100,
                        keys: stats.keys,
                        keySize: stats.ksize,
                        valueSize: stats.vsize,
                    },
                    warming: {
                        enabled: warmupStats.enabled,
                        filesWarmed: warmupStats.filesWarmed,
                        cacheSize: warmupStats.cacheSize,
                    },
                    thresholds: {
                        responseTime: '100ms',
                        memoryUsage: `${memoryThreshold}%`,
                        hitRate: '70%',
                    },
                    warnings: this.generateWarnings(stats, memoryUsagePercent, memoryThreshold),
                },
            };
            if (isHealthy) {
                logger_util_1.CorrelatedLogger.debug(`Cache health check passed in ${responseTime}ms`, CacheHealthIndicator_1.name);
            }
            else {
                logger_util_1.CorrelatedLogger.warn(`Cache health check failed: response time ${responseTime}ms, memory usage ${memoryUsagePercent}%`, CacheHealthIndicator_1.name);
            }
            return result;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            logger_util_1.CorrelatedLogger.error(`Cache health check failed: ${error.message}`, error.stack, CacheHealthIndicator_1.name);
            return {
                [this.key]: {
                    status: 'down',
                    error: error.message,
                    responseTime: `${responseTime}ms`,
                    lastCheck: new Date().toISOString(),
                },
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
                    maxKeys: this.configService.get('cache.memory.maxKeys') || 1000,
                    defaultTtl: this.configService.get('cache.memory.defaultTtl') || 3600,
                    checkPeriod: this.configService.get('cache.memory.checkPeriod') || 600,
                },
                recentKeys: keys.slice(0, 10),
                lastUpdated: new Date().toISOString(),
            };
        }
        catch (error) {
            return {
                type: 'memory-cache',
                status: 'error',
                error: error.message,
                lastUpdated: new Date().toISOString(),
            };
        }
    }
    getDescription() {
        return 'Memory cache health indicator that tests cache operations and monitors memory usage';
    }
};
exports.CacheHealthIndicator = CacheHealthIndicator;
exports.CacheHealthIndicator = CacheHealthIndicator = CacheHealthIndicator_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [memory_cache_service_1.MemoryCacheService,
        cache_warming_service_1.CacheWarmingService,
        config_service_1.ConfigService])
], CacheHealthIndicator);
//# sourceMappingURL=cache-health.indicator.js.map