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
var RedisHealthIndicator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisHealthIndicator = void 0;
const config_service_1 = require("../../Config/config.service");
const logger_util_1 = require("../../Correlation/utils/logger.util");
const base_health_indicator_1 = require("../../Health/base/base-health-indicator");
const common_1 = require("@nestjs/common");
const redis_cache_service_1 = require("../services/redis-cache.service");
let RedisHealthIndicator = RedisHealthIndicator_1 = class RedisHealthIndicator extends base_health_indicator_1.BaseHealthIndicator {
    constructor(redisCacheService, configService) {
        super('redis');
        this.redisCacheService = redisCacheService;
        this.configService = configService;
    }
    async performHealthCheck() {
        const startTime = Date.now();
        try {
            const pingResult = await this.redisCacheService.ping();
            if (pingResult !== 'PONG') {
                throw new Error(`Redis ping failed: ${pingResult}`);
            }
            const testKey = 'health-check-redis-test';
            const testValue = { timestamp: Date.now(), test: true };
            await this.redisCacheService.set(testKey, testValue, 60);
            const retrievedValue = await this.redisCacheService.get(testKey);
            if (!retrievedValue || retrievedValue.timestamp !== testValue.timestamp) {
                throw new Error('Redis GET operation failed');
            }
            const ttl = await this.redisCacheService.getTtl(testKey);
            if (ttl <= 0 || ttl > 60) {
                throw new Error(`Redis TTL operation failed: ${ttl}`);
            }
            await this.redisCacheService.delete(testKey);
            const deletedValue = await this.redisCacheService.get(testKey);
            if (deletedValue !== null) {
                throw new Error('Redis DELETE operation failed');
            }
            const stats = await this.redisCacheService.getStats();
            const memoryUsage = await this.redisCacheService.getMemoryUsage();
            const connectionStatus = this.redisCacheService.getConnectionStatus();
            const responseTime = Date.now() - startTime;
            const isHealthy = responseTime < 200 && connectionStatus.connected;
            const result = {
                [this.key]: {
                    status: isHealthy ? 'up' : 'down',
                    responseTime: `${responseTime}ms`,
                    connection: {
                        connected: connectionStatus.connected,
                        host: this.configService.get('cache.redis.host'),
                        port: this.configService.get('cache.redis.port'),
                        db: this.configService.get('cache.redis.db'),
                    },
                    statistics: {
                        hits: stats.hits,
                        misses: stats.misses,
                        hitRate: Math.round(stats.hitRate * 10000) / 100,
                        keys: stats.keys,
                        operations: connectionStatus.stats.operations,
                        errors: connectionStatus.stats.errors,
                    },
                    memory: {
                        used: memoryUsage.used,
                        peak: memoryUsage.peak,
                        fragmentation: memoryUsage.fragmentation,
                        usedMB: Math.round(memoryUsage.used / 1024 / 1024 * 100) / 100,
                    },
                    thresholds: {
                        responseTime: '200ms',
                        hitRate: '70%',
                        memoryFragmentation: '1.5',
                    },
                    warnings: this.generateWarnings(stats, memoryUsage, responseTime),
                },
            };
            if (isHealthy) {
                logger_util_1.CorrelatedLogger.debug(`Redis health check passed in ${responseTime}ms`, RedisHealthIndicator_1.name);
            }
            else {
                logger_util_1.CorrelatedLogger.warn(`Redis health check failed: response time ${responseTime}ms, connected ${connectionStatus.connected}`, RedisHealthIndicator_1.name);
            }
            return result;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            logger_util_1.CorrelatedLogger.error(`Redis health check failed: ${error.message}`, error.stack, RedisHealthIndicator_1.name);
            return {
                [this.key]: {
                    status: 'down',
                    error: error.message,
                    responseTime: `${responseTime}ms`,
                    connection: {
                        connected: false,
                        host: this.configService.get('cache.redis.host'),
                        port: this.configService.get('cache.redis.port'),
                        db: this.configService.get('cache.redis.db'),
                    },
                    lastCheck: new Date().toISOString(),
                },
            };
        }
    }
    generateWarnings(stats, memoryUsage, responseTime) {
        const warnings = [];
        if (responseTime > 100) {
            warnings.push(`Response time (${responseTime}ms) is slower than optimal (100ms)`);
        }
        if (stats.hitRate < 0.7) {
            warnings.push(`Cache hit rate (${Math.round(stats.hitRate * 100)}%) is below optimal (70%)`);
        }
        if (memoryUsage.fragmentation > 1.5) {
            warnings.push(`Memory fragmentation (${memoryUsage.fragmentation}) is high (>1.5)`);
        }
        if (stats.errors > 0) {
            warnings.push(`Redis has recorded ${stats.errors} errors`);
        }
        const memoryUsageMB = memoryUsage.used / 1024 / 1024;
        if (memoryUsageMB > 100) {
            warnings.push(`Memory usage (${Math.round(memoryUsageMB)}MB) is high`);
        }
        return warnings;
    }
    async getDetailedStatus() {
        try {
            const stats = await this.redisCacheService.getStats();
            const memoryUsage = await this.redisCacheService.getMemoryUsage();
            const connectionStatus = this.redisCacheService.getConnectionStatus();
            const keys = await this.redisCacheService.keys();
            return {
                type: 'redis-cache',
                status: connectionStatus.connected ? 'operational' : 'disconnected',
                connection: {
                    connected: connectionStatus.connected,
                    host: this.configService.get('cache.redis.host'),
                    port: this.configService.get('cache.redis.port'),
                    db: this.configService.get('cache.redis.db'),
                },
                statistics: {
                    ...stats,
                    operations: connectionStatus.stats.operations,
                    errors: connectionStatus.stats.errors,
                },
                memory: {
                    ...memoryUsage,
                    usedMB: Math.round(memoryUsage.used / 1024 / 1024 * 100) / 100,
                    peakMB: Math.round(memoryUsage.peak / 1024 / 1024 * 100) / 100,
                },
                configuration: {
                    host: this.configService.get('cache.redis.host'),
                    port: this.configService.get('cache.redis.port'),
                    db: this.configService.get('cache.redis.db'),
                    ttl: this.configService.get('cache.redis.ttl'),
                    maxRetries: this.configService.get('cache.redis.maxRetries'),
                },
                recentKeys: keys.slice(0, 10),
                lastUpdated: new Date().toISOString(),
            };
        }
        catch (error) {
            return {
                type: 'redis-cache',
                status: 'error',
                error: error.message,
                lastUpdated: new Date().toISOString(),
            };
        }
    }
    getDescription() {
        return 'Redis cache health indicator that tests connection and basic operations';
    }
};
exports.RedisHealthIndicator = RedisHealthIndicator;
exports.RedisHealthIndicator = RedisHealthIndicator = RedisHealthIndicator_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_cache_service_1.RedisCacheService,
        config_service_1.ConfigService])
], RedisHealthIndicator);
//# sourceMappingURL=redis-health.indicator.js.map