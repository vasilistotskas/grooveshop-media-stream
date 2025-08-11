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
var MultiLayerCacheManager_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiLayerCacheManager = void 0;
const config_service_1 = require("../../Config/config.service");
const logger_util_1 = require("../../Correlation/utils/logger.util");
const metrics_service_1 = require("../../Metrics/services/metrics.service");
const common_1 = require("@nestjs/common");
const file_cache_layer_1 = require("../layers/file-cache.layer");
const memory_cache_layer_1 = require("../layers/memory-cache.layer");
const redis_cache_layer_1 = require("../layers/redis-cache.layer");
const cache_key_strategy_1 = require("../strategies/cache-key.strategy");
let MultiLayerCacheManager = MultiLayerCacheManager_1 = class MultiLayerCacheManager {
    constructor(_configService, metricsService, memoryCacheLayer, redisCacheLayer, fileCacheLayer) {
        this._configService = _configService;
        this.metricsService = metricsService;
        this.memoryCacheLayer = memoryCacheLayer;
        this.redisCacheLayer = redisCacheLayer;
        this.fileCacheLayer = fileCacheLayer;
        this.layers = [];
        this.popularKeys = new Map();
        this.keyStrategy = new cache_key_strategy_1.DefaultCacheKeyStrategy();
        this.preloadingEnabled = this._configService.getOptional('cache.preloading.enabled', false);
    }
    async onModuleInit() {
        this.layers = [
            this.memoryCacheLayer,
            this.redisCacheLayer,
            this.fileCacheLayer,
        ].sort((a, b) => a.getPriority() - b.getPriority());
        logger_util_1.CorrelatedLogger.debug(`Multi-layer cache initialized with ${this.layers.length} layers: ${this.layers.map(l => l.getLayerName()).join(', ')}`, MultiLayerCacheManager_1.name);
        if (this.preloadingEnabled) {
            this.startPreloading();
        }
    }
    async get(namespace, identifier, params) {
        const key = this.keyStrategy.generateKey(namespace, identifier, params);
        this.trackKeyAccess(key);
        for (const layer of this.layers) {
            try {
                const value = await layer.get(key);
                if (value !== null) {
                    logger_util_1.CorrelatedLogger.debug(`Cache HIT in ${layer.getLayerName()} layer for key: ${key}`, MultiLayerCacheManager_1.name);
                    this.metricsService.recordCacheOperation('get', layer.getLayerName(), 'hit');
                    await this.backfillLayers(key, value, layer);
                    return value;
                }
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Cache layer ${layer.getLayerName()} failed for key ${key}: ${error.message}`, MultiLayerCacheManager_1.name);
            }
        }
        logger_util_1.CorrelatedLogger.debug(`Cache MISS for key: ${key}`, MultiLayerCacheManager_1.name);
        this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss');
        return null;
    }
    async set(namespace, identifier, value, ttl, params) {
        const key = this.keyStrategy.generateKey(namespace, identifier, params);
        const setPromises = this.layers.map(async (layer) => {
            try {
                await layer.set(key, value, ttl);
                logger_util_1.CorrelatedLogger.debug(`Cache SET in ${layer.getLayerName()} layer for key: ${key}`, MultiLayerCacheManager_1.name);
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Cache SET failed in ${layer.getLayerName()} layer for key ${key}: ${error.message}`, MultiLayerCacheManager_1.name);
            }
        });
        await Promise.allSettled(setPromises);
        this.metricsService.recordCacheOperation('set', 'multi-layer', 'success');
    }
    async delete(namespace, identifier, params) {
        const key = this.keyStrategy.generateKey(namespace, identifier, params);
        const deletePromises = this.layers.map(async (layer) => {
            try {
                await layer.delete(key);
                logger_util_1.CorrelatedLogger.debug(`Cache DELETE in ${layer.getLayerName()} layer for key: ${key}`, MultiLayerCacheManager_1.name);
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Cache DELETE failed in ${layer.getLayerName()} layer for key ${key}: ${error.message}`, MultiLayerCacheManager_1.name);
            }
        });
        await Promise.allSettled(deletePromises);
        this.popularKeys.delete(key);
        this.metricsService.recordCacheOperation('delete', 'multi-layer', 'success');
    }
    async exists(namespace, identifier, params) {
        const key = this.keyStrategy.generateKey(namespace, identifier, params);
        for (const layer of this.layers) {
            try {
                if (await layer.exists(key)) {
                    return true;
                }
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Cache EXISTS check failed in ${layer.getLayerName()} layer for key ${key}: ${error.message}`, MultiLayerCacheManager_1.name);
            }
        }
        return false;
    }
    async clear() {
        const clearPromises = this.layers.map(async (layer) => {
            try {
                await layer.clear();
                logger_util_1.CorrelatedLogger.debug(`Cache CLEARED in ${layer.getLayerName()} layer`, MultiLayerCacheManager_1.name);
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Cache CLEAR failed in ${layer.getLayerName()} layer: ${error.message}`, MultiLayerCacheManager_1.name);
            }
        });
        await Promise.allSettled(clearPromises);
        this.popularKeys.clear();
        this.metricsService.recordCacheOperation('flush', 'multi-layer', 'success');
    }
    async invalidateNamespace(namespace) {
        logger_util_1.CorrelatedLogger.debug(`Invalidating cache namespace: ${namespace}`, MultiLayerCacheManager_1.name);
        await this.clear();
        this.metricsService.recordCacheOperation('flush', 'multi-layer', 'success');
    }
    async getStats() {
        const layerStats = {};
        let totalHits = 0;
        let totalMisses = 0;
        const layerHitDistribution = {};
        for (const layer of this.layers) {
            try {
                const stats = await layer.getStats();
                layerStats[layer.getLayerName()] = stats;
                totalHits += stats.hits;
                totalMisses += stats.misses;
                layerHitDistribution[layer.getLayerName()] = stats.hits;
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Failed to get stats from ${layer.getLayerName()} layer: ${error.message}`, MultiLayerCacheManager_1.name);
                layerStats[layer.getLayerName()] = {
                    hits: 0,
                    misses: 0,
                    keys: 0,
                    hitRate: 0,
                    errors: 1,
                };
            }
        }
        const totalRequests = totalHits + totalMisses;
        const overallHitRate = totalRequests > 0 ? totalHits / totalRequests : 0;
        return {
            layers: layerStats,
            totalHits,
            totalMisses,
            overallHitRate,
            layerHitDistribution,
        };
    }
    async preloadPopularKeys() {
        if (!this.preloadingEnabled) {
            return;
        }
        const popularKeys = Array.from(this.popularKeys.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, 100)
            .map(([key]) => key);
        logger_util_1.CorrelatedLogger.debug(`Preloading ${popularKeys.length} popular keys`, MultiLayerCacheManager_1.name);
        for (const key of popularKeys) {
            try {
                for (let i = this.layers.length - 1; i >= 0; i--) {
                    const value = await this.layers[i].get(key);
                    if (value !== null) {
                        for (let j = 0; j < i; j++) {
                            await this.layers[j].set(key, value);
                        }
                        break;
                    }
                }
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Failed to preload key ${key}: ${error.message}`, MultiLayerCacheManager_1.name);
            }
        }
    }
    async backfillLayers(key, value, sourceLayer) {
        const sourceIndex = this.layers.findIndex(layer => layer === sourceLayer);
        if (sourceIndex <= 0) {
            return;
        }
        const backfillPromises = this.layers.slice(0, sourceIndex).map(async (layer) => {
            try {
                await layer.set(key, value, undefined);
                logger_util_1.CorrelatedLogger.debug(`Backfilled ${layer.getLayerName()} layer with key: ${key}`, MultiLayerCacheManager_1.name);
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Failed to backfill ${layer.getLayerName()} layer for key ${key}: ${error.message}`, MultiLayerCacheManager_1.name);
            }
        });
        await Promise.allSettled(backfillPromises);
    }
    trackKeyAccess(key) {
        if (!this.preloadingEnabled) {
            return;
        }
        const currentCount = this.popularKeys.get(key) || 0;
        this.popularKeys.set(key, currentCount + 1);
        if (this.popularKeys.size > 10000) {
            const entries = Array.from(this.popularKeys.entries())
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5000);
            this.popularKeys.clear();
            entries.forEach(([k, v]) => this.popularKeys.set(k, v));
        }
    }
    startPreloading() {
        const interval = this._configService.getOptional('cache.preloading.interval', 300000);
        setInterval(async () => {
            try {
                await this.preloadPopularKeys();
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.error(`Preloading failed: ${error.message}`, error.stack, MultiLayerCacheManager_1.name);
            }
        }, interval);
        logger_util_1.CorrelatedLogger.debug(`Cache preloading started with ${interval}ms interval`, MultiLayerCacheManager_1.name);
    }
};
exports.MultiLayerCacheManager = MultiLayerCacheManager;
exports.MultiLayerCacheManager = MultiLayerCacheManager = MultiLayerCacheManager_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService,
        metrics_service_1.MetricsService,
        memory_cache_layer_1.MemoryCacheLayer,
        redis_cache_layer_1.RedisCacheLayer,
        file_cache_layer_1.FileCacheLayer])
], MultiLayerCacheManager);
//# sourceMappingURL=multi-layer-cache.manager.js.map