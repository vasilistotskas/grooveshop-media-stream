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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var MemoryCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryCacheService = void 0;
const config_service_1 = require("../../Config/config.service");
const logger_util_1 = require("../../Correlation/utils/logger.util");
const metrics_service_1 = require("../../Metrics/services/metrics.service");
const common_1 = require("@nestjs/common");
const node_cache_1 = __importDefault(require("node-cache"));
let MemoryCacheService = MemoryCacheService_1 = class MemoryCacheService {
    constructor(configService, metricsService) {
        this.configService = configService;
        this.metricsService = metricsService;
        this.logger = new common_1.Logger(MemoryCacheService_1.name);
        const config = this.configService.get('cache.memory') || {};
        this.cache = new node_cache_1.default({
            stdTTL: config.defaultTtl || 3600,
            checkperiod: config.checkPeriod || 600,
            useClones: false,
            deleteOnExpire: true,
            maxKeys: config.maxKeys || 1000,
        });
        this.cache.on('set', (key, _value) => {
            this.metricsService.recordCacheOperation('set', 'memory', 'success');
            logger_util_1.CorrelatedLogger.debug(`Memory cache SET: ${key}`, MemoryCacheService_1.name);
        });
        this.cache.on('get', (key, value) => {
            if (value !== undefined) {
                this.metricsService.recordCacheOperation('get', 'memory', 'hit');
                logger_util_1.CorrelatedLogger.debug(`Memory cache HIT: ${key}`, MemoryCacheService_1.name);
            }
            else {
                this.metricsService.recordCacheOperation('get', 'memory', 'miss');
                logger_util_1.CorrelatedLogger.debug(`Memory cache MISS: ${key}`, MemoryCacheService_1.name);
            }
        });
        this.cache.on('del', (key, _value) => {
            this.metricsService.recordCacheOperation('delete', 'memory', 'success');
            logger_util_1.CorrelatedLogger.debug(`Memory cache DELETE: ${key}`, MemoryCacheService_1.name);
        });
        this.cache.on('expired', (key, _value) => {
            this.metricsService.recordCacheOperation('expire', 'memory', 'success');
            logger_util_1.CorrelatedLogger.debug(`Memory cache EXPIRED: ${key}`, MemoryCacheService_1.name);
        });
        this.cache.on('flush', () => {
            this.metricsService.recordCacheOperation('flush', 'memory', 'success');
            logger_util_1.CorrelatedLogger.debug('Memory cache FLUSHED', MemoryCacheService_1.name);
        });
    }
    async get(key) {
        try {
            const value = this.cache.get(key);
            return value !== undefined ? value : null;
        }
        catch (error) {
            this.metricsService.recordCacheOperation('get', 'memory', 'error');
            logger_util_1.CorrelatedLogger.error(`Memory cache GET error for key ${key}: ${error.message}`, error.stack, MemoryCacheService_1.name);
            return null;
        }
    }
    async set(key, value, ttl) {
        try {
            const success = this.cache.set(key, value, ttl);
            if (!success) {
                this.metricsService.recordCacheOperation('set', 'memory', 'error');
                logger_util_1.CorrelatedLogger.warn(`Failed to set memory cache key: ${key}`, MemoryCacheService_1.name);
            }
        }
        catch (error) {
            this.metricsService.recordCacheOperation('set', 'memory', 'error');
            logger_util_1.CorrelatedLogger.error(`Memory cache SET error for key ${key}: ${error.message}`, error.stack, MemoryCacheService_1.name);
            throw error;
        }
    }
    async delete(key) {
        try {
            this.cache.del(key);
        }
        catch (error) {
            this.metricsService.recordCacheOperation('delete', 'memory', 'error');
            logger_util_1.CorrelatedLogger.error(`Memory cache DELETE error for key ${key}: ${error.message}`, error.stack, MemoryCacheService_1.name);
            throw error;
        }
    }
    async clear() {
        try {
            this.cache.flushAll();
        }
        catch (error) {
            this.metricsService.recordCacheOperation('clear', 'memory', 'error');
            logger_util_1.CorrelatedLogger.error(`Memory cache CLEAR error: ${error.message}`, error.stack, MemoryCacheService_1.name);
            throw error;
        }
    }
    async getStats() {
        try {
            const stats = this.cache.getStats();
            const hitRate = stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0;
            this.metricsService.updateCacheHitRatio('memory', hitRate);
            return {
                hits: stats.hits,
                misses: stats.misses,
                keys: stats.keys,
                ksize: stats.ksize,
                vsize: stats.vsize,
                hitRate,
            };
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Memory cache STATS error: ${error.message}`, error.stack, MemoryCacheService_1.name);
            return {
                hits: 0,
                misses: 0,
                keys: 0,
                ksize: 0,
                vsize: 0,
                hitRate: 0,
            };
        }
    }
    async has(key) {
        try {
            return this.cache.has(key);
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Memory cache HAS error for key ${key}: ${error.message}`, error.stack, MemoryCacheService_1.name);
            return false;
        }
    }
    async exists(key) {
        return this.has(key);
    }
    async keys() {
        try {
            return this.cache.keys();
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Memory cache KEYS error: ${error.message}`, error.stack, MemoryCacheService_1.name);
            return [];
        }
    }
    async flushAll() {
        try {
            this.cache.flushAll();
        }
        catch (error) {
            this.metricsService.recordCacheOperation('flush', 'memory', 'error');
            logger_util_1.CorrelatedLogger.error(`Memory cache FLUSH error: ${error.message}`, error.stack, MemoryCacheService_1.name);
            throw error;
        }
    }
    getTtl(key) {
        return this.cache.getTtl(key);
    }
    setTtl(key, ttl) {
        return this.cache.ttl(key, ttl);
    }
    getMemoryUsage() {
        const stats = this.cache.getStats();
        return {
            used: stats.vsize + stats.ksize,
            total: this.configService.get('cache.memory.maxSize') || 100 * 1024 * 1024,
        };
    }
};
exports.MemoryCacheService = MemoryCacheService;
exports.MemoryCacheService = MemoryCacheService = MemoryCacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService,
        metrics_service_1.MetricsService])
], MemoryCacheService);
//# sourceMappingURL=memory-cache.service.js.map