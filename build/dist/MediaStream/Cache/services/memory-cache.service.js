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
import { MetricsService } from "../../Metrics/services/metrics.service.js";
import { Injectable } from "@nestjs/common";
import NodeCache from "node-cache";
export class MemoryCacheService {
    async get(key) {
        try {
            const value = this.cache.get(key);
            return value !== undefined ? value : null;
        } catch (error) {
            this.metricsService.recordCacheOperation('get', 'memory', 'error');
            CorrelatedLogger.error(`Memory cache GET error for key ${key}: ${error.message}`, error.stack, MemoryCacheService.name);
            return null;
        }
    }
    async set(key, value, ttl) {
        try {
            const success = ttl !== undefined ? this.cache.set(key, value, ttl) : this.cache.set(key, value);
            if (!success) {
                this.metricsService.recordCacheOperation('set', 'memory', 'error');
                CorrelatedLogger.warn(`Failed to set memory cache key: ${key}`, MemoryCacheService.name);
            }
        } catch (error) {
            this.metricsService.recordCacheOperation('set', 'memory', 'error');
            CorrelatedLogger.error(`Memory cache SET error for key ${key}: ${error.message}`, error.stack, MemoryCacheService.name);
            throw error;
        }
    }
    async delete(key) {
        try {
            this.cache.del(key);
        } catch (error) {
            this.metricsService.recordCacheOperation('delete', 'memory', 'error');
            CorrelatedLogger.error(`Memory cache DELETE error for key ${key}: ${error.message}`, error.stack, MemoryCacheService.name);
            throw error;
        }
    }
    async clear() {
        try {
            this.cache.flushAll();
        } catch (error) {
            this.metricsService.recordCacheOperation('clear', 'memory', 'error');
            CorrelatedLogger.error(`Memory cache CLEAR error: ${error.message}`, error.stack, MemoryCacheService.name);
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
                hitRate
            };
        } catch (error) {
            CorrelatedLogger.error(`Memory cache STATS error: ${error.message}`, error.stack, MemoryCacheService.name);
            return {
                hits: 0,
                misses: 0,
                keys: 0,
                ksize: 0,
                vsize: 0,
                hitRate: 0
            };
        }
    }
    async has(key) {
        try {
            return this.cache.has(key);
        } catch (error) {
            CorrelatedLogger.error(`Memory cache HAS error for key ${key}: ${error.message}`, error.stack, MemoryCacheService.name);
            return false;
        }
    }
    async exists(key) {
        return this.has(key);
    }
    async keys() {
        try {
            return this.cache.keys();
        } catch (error) {
            CorrelatedLogger.error(`Memory cache KEYS error: ${error.message}`, error.stack, MemoryCacheService.name);
            return [];
        }
    }
    async flushAll() {
        try {
            this.cache.flushAll();
        } catch (error) {
            this.metricsService.recordCacheOperation('flush', 'memory', 'error');
            CorrelatedLogger.error(`Memory cache FLUSH error: ${error.message}`, error.stack, MemoryCacheService.name);
            throw error;
        }
    }
    getTtl(key) {
        return this.cache.getTtl(key) ?? 0;
    }
    setTtl(key, ttl) {
        return this.cache.ttl(key, ttl);
    }
    getMemoryUsage() {
        const stats = this.cache.getStats();
        return {
            used: stats.vsize + stats.ksize,
            total: this._configService.get('cache.memory.maxSize') || 100 * 1024 * 1024
        };
    }
    constructor(_configService, metricsService){
        this._configService = _configService;
        this.metricsService = metricsService;
        const config = this._configService.get('cache.memory') || {};
        this.cache = new NodeCache({
            stdTTL: config.defaultTtl || 3600,
            checkperiod: config.checkPeriod || 600,
            useClones: false,
            deleteOnExpire: true,
            maxKeys: config.maxKeys || 1000
        });
        this.cache.on('set', (key, _value)=>{
            this.metricsService.recordCacheOperation('set', 'memory', 'success');
            CorrelatedLogger.debug(`Memory cache SET: ${key}`, MemoryCacheService.name);
        });
        this.cache.on('get', (key, value)=>{
            if (value !== undefined) {
                this.metricsService.recordCacheOperation('get', 'memory', 'hit');
                CorrelatedLogger.debug(`Memory cache HIT: ${key}`, MemoryCacheService.name);
            } else {
                this.metricsService.recordCacheOperation('get', 'memory', 'miss');
                CorrelatedLogger.debug(`Memory cache MISS: ${key}`, MemoryCacheService.name);
            }
        });
        this.cache.on('del', (key, _value)=>{
            this.metricsService.recordCacheOperation('delete', 'memory', 'success');
            CorrelatedLogger.debug(`Memory cache DELETE: ${key}`, MemoryCacheService.name);
        });
        this.cache.on('expired', (key, _value)=>{
            this.metricsService.recordCacheOperation('expire', 'memory', 'success');
            CorrelatedLogger.debug(`Memory cache EXPIRED: ${key}`, MemoryCacheService.name);
        });
        this.cache.on('flush', ()=>{
            this.metricsService.recordCacheOperation('flush', 'memory', 'success');
            CorrelatedLogger.debug('Memory cache FLUSHED', MemoryCacheService.name);
        });
    }
}
MemoryCacheService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ConfigService === "undefined" ? Object : ConfigService,
        typeof MetricsService === "undefined" ? Object : MetricsService
    ])
], MemoryCacheService);

//# sourceMappingURL=memory-cache.service.js.map