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
var RedisCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisCacheService = void 0;
const config_service_1 = require("../../Config/config.service");
const logger_util_1 = require("../../Correlation/utils/logger.util");
const metrics_service_1 = require("../../Metrics/services/metrics.service");
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisCacheService = RedisCacheService_1 = class RedisCacheService {
    constructor(configService, metricsService) {
        this.configService = configService;
        this.metricsService = metricsService;
        this.logger = new common_1.Logger(RedisCacheService_1.name);
        this.isConnected = false;
        this.stats = {
            hits: 0,
            misses: 0,
            operations: 0,
            errors: 0,
        };
    }
    async onModuleInit() {
        await this.initializeRedis();
    }
    async onModuleDestroy() {
        if (this.redis) {
            await this.redis.quit();
            logger_util_1.CorrelatedLogger.log('Redis connection closed', RedisCacheService_1.name);
        }
    }
    async initializeRedis() {
        try {
            const config = this.configService.get('cache.redis');
            this.redis = new ioredis_1.default({
                host: config.host,
                port: config.port,
                password: config.password,
                db: config.db,
                maxRetriesPerRequest: config.maxRetries,
                enableReadyCheck: true,
                lazyConnect: true,
                keepAlive: 30000,
                connectTimeout: 10000,
                commandTimeout: 5000,
            });
            this.redis.on('connect', () => {
                logger_util_1.CorrelatedLogger.log('Redis connecting...', RedisCacheService_1.name);
            });
            this.redis.on('ready', () => {
                this.isConnected = true;
                logger_util_1.CorrelatedLogger.log('Redis connection ready', RedisCacheService_1.name);
                this.metricsService.updateActiveConnections('redis', 1);
            });
            this.redis.on('error', (error) => {
                this.isConnected = false;
                this.stats.errors++;
                logger_util_1.CorrelatedLogger.error(`Redis connection error: ${error.message}`, error.stack, RedisCacheService_1.name);
                this.metricsService.updateActiveConnections('redis', 0);
            });
            this.redis.on('close', () => {
                this.isConnected = false;
                logger_util_1.CorrelatedLogger.warn('Redis connection closed', RedisCacheService_1.name);
                this.metricsService.updateActiveConnections('redis', 0);
            });
            this.redis.on('reconnecting', () => {
                logger_util_1.CorrelatedLogger.log('Redis reconnecting...', RedisCacheService_1.name);
            });
            await this.redis.connect();
        }
        catch (error) {
            this.isConnected = false;
            logger_util_1.CorrelatedLogger.error(`Failed to initialize Redis: ${error.message}`, error.stack, RedisCacheService_1.name);
            throw error;
        }
    }
    async get(key) {
        if (!this.isConnected) {
            logger_util_1.CorrelatedLogger.warn('Redis not connected, returning null', RedisCacheService_1.name);
            this.stats.misses++;
            this.metricsService.recordCacheOperation('get', 'redis', 'miss');
            return null;
        }
        try {
            this.stats.operations++;
            const value = await this.redis.get(key);
            if (value === null) {
                this.stats.misses++;
                this.metricsService.recordCacheOperation('get', 'redis', 'miss');
                logger_util_1.CorrelatedLogger.debug(`Redis cache MISS: ${key}`, RedisCacheService_1.name);
                return null;
            }
            this.stats.hits++;
            this.metricsService.recordCacheOperation('get', 'redis', 'hit');
            logger_util_1.CorrelatedLogger.debug(`Redis cache HIT: ${key}`, RedisCacheService_1.name);
            return JSON.parse(value);
        }
        catch (error) {
            this.stats.errors++;
            this.stats.misses++;
            this.metricsService.recordCacheOperation('get', 'redis', 'error');
            logger_util_1.CorrelatedLogger.error(`Redis cache GET error for key ${key}: ${error.message}`, error.stack, RedisCacheService_1.name);
            return null;
        }
    }
    async set(key, value, ttl) {
        if (!this.isConnected) {
            logger_util_1.CorrelatedLogger.warn('Redis not connected, skipping SET operation', RedisCacheService_1.name);
            return;
        }
        try {
            this.stats.operations++;
            const serializedValue = JSON.stringify(value);
            const defaultTtl = this.configService.get('cache.redis.ttl');
            const effectiveTtl = ttl !== undefined ? ttl : defaultTtl;
            if (effectiveTtl > 0) {
                await this.redis.setex(key, effectiveTtl, serializedValue);
            }
            else {
                await this.redis.set(key, serializedValue);
            }
            this.metricsService.recordCacheOperation('set', 'redis', 'success');
            logger_util_1.CorrelatedLogger.debug(`Redis cache SET: ${key} (TTL: ${effectiveTtl}s)`, RedisCacheService_1.name);
        }
        catch (error) {
            this.stats.errors++;
            this.metricsService.recordCacheOperation('set', 'redis', 'error');
            logger_util_1.CorrelatedLogger.error(`Redis cache SET error for key ${key}: ${error.message}`, error.stack, RedisCacheService_1.name);
        }
    }
    async delete(key) {
        if (!this.isConnected) {
            logger_util_1.CorrelatedLogger.warn('Redis not connected, skipping DELETE operation', RedisCacheService_1.name);
            return;
        }
        try {
            this.stats.operations++;
            await this.redis.del(key);
            this.metricsService.recordCacheOperation('delete', 'redis', 'success');
            logger_util_1.CorrelatedLogger.debug(`Redis cache DELETE: ${key}`, RedisCacheService_1.name);
        }
        catch (error) {
            this.stats.errors++;
            this.metricsService.recordCacheOperation('delete', 'redis', 'error');
            logger_util_1.CorrelatedLogger.error(`Redis cache DELETE error for key ${key}: ${error.message}`, error.stack, RedisCacheService_1.name);
            throw error;
        }
    }
    async clear() {
        if (!this.isConnected) {
            logger_util_1.CorrelatedLogger.warn('Redis not connected, skipping CLEAR operation', RedisCacheService_1.name);
            return;
        }
        try {
            this.stats.operations++;
            const db = this.configService.get('cache.redis.db');
            await this.redis.flushdb();
            this.metricsService.recordCacheOperation('clear', 'redis', 'success');
            logger_util_1.CorrelatedLogger.debug(`Redis cache CLEARED (DB: ${db})`, RedisCacheService_1.name);
        }
        catch (error) {
            this.stats.errors++;
            this.metricsService.recordCacheOperation('clear', 'redis', 'error');
            logger_util_1.CorrelatedLogger.error(`Redis cache CLEAR error: ${error.message}`, error.stack, RedisCacheService_1.name);
            throw error;
        }
    }
    async has(key) {
        if (!this.isConnected) {
            return false;
        }
        try {
            this.stats.operations++;
            const exists = await this.redis.exists(key);
            return exists === 1;
        }
        catch (error) {
            this.stats.errors++;
            logger_util_1.CorrelatedLogger.error(`Redis cache HAS error for key ${key}: ${error.message}`, error.stack, RedisCacheService_1.name);
            return false;
        }
    }
    async exists(key) {
        return this.has(key);
    }
    async keys() {
        if (!this.isConnected) {
            return [];
        }
        try {
            this.stats.operations++;
            return await this.redis.keys('*');
        }
        catch (error) {
            this.stats.errors++;
            logger_util_1.CorrelatedLogger.error(`Redis cache KEYS error: ${error.message}`, error.stack, RedisCacheService_1.name);
            return [];
        }
    }
    async flushAll() {
        if (!this.isConnected) {
            logger_util_1.CorrelatedLogger.warn('Redis not connected, skipping FLUSH operation', RedisCacheService_1.name);
            return;
        }
        try {
            this.stats.operations++;
            await this.redis.flushall();
            this.metricsService.recordCacheOperation('flush', 'redis', 'success');
            logger_util_1.CorrelatedLogger.debug('Redis cache FLUSHED ALL', RedisCacheService_1.name);
        }
        catch (error) {
            this.stats.errors++;
            this.metricsService.recordCacheOperation('flush', 'redis', 'error');
            logger_util_1.CorrelatedLogger.error(`Redis cache FLUSH error: ${error.message}`, error.stack, RedisCacheService_1.name);
            throw error;
        }
    }
    async getStats() {
        try {
            const hitRate = this.stats.hits + this.stats.misses > 0
                ? this.stats.hits / (this.stats.hits + this.stats.misses)
                : 0;
            this.metricsService.updateCacheHitRatio('redis', hitRate);
            let keys = 0;
            let memoryUsage = 0;
            if (this.isConnected) {
                try {
                    const info = await this.redis.info('keyspace');
                    const dbInfo = info.match(/db\d+:keys=(\d+)/);
                    keys = dbInfo ? Number.parseInt(dbInfo[1]) : 0;
                    const memInfo = await this.redis.info('memory');
                    const memMatch = memInfo.match(/used_memory:(\d+)/);
                    memoryUsage = memMatch ? Number.parseInt(memMatch[1]) : 0;
                }
                catch (error) {
                    logger_util_1.CorrelatedLogger.warn(`Failed to get Redis info: ${error.message}`, RedisCacheService_1.name);
                }
            }
            return {
                hits: this.stats.hits,
                misses: this.stats.misses,
                keys,
                ksize: 0,
                vsize: memoryUsage,
                hitRate,
            };
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Redis cache STATS error: ${error.message}`, error.stack, RedisCacheService_1.name);
            return {
                hits: this.stats.hits,
                misses: this.stats.misses,
                keys: 0,
                ksize: 0,
                vsize: 0,
                hitRate: 0,
            };
        }
    }
    async ping() {
        if (!this.isConnected) {
            throw new Error('Redis not connected');
        }
        return await this.redis.ping();
    }
    async getTtl(key) {
        if (!this.isConnected) {
            return -1;
        }
        try {
            return await this.redis.ttl(key);
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Redis TTL error for key ${key}: ${error.message}`, error.stack, RedisCacheService_1.name);
            return -1;
        }
    }
    async setTtl(key, ttl) {
        if (!this.isConnected) {
            return false;
        }
        try {
            const result = await this.redis.expire(key, ttl);
            return result === 1;
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Redis EXPIRE error for key ${key}: ${error.message}`, error.stack, RedisCacheService_1.name);
            return false;
        }
    }
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            stats: { ...this.stats },
        };
    }
    async getMemoryUsage() {
        if (!this.isConnected) {
            return { used: 0, peak: 0, fragmentation: 0 };
        }
        try {
            const info = await this.redis.info('memory');
            const used = this.extractMemoryValue(info, 'used_memory');
            const peak = this.extractMemoryValue(info, 'used_memory_peak');
            const fragmentation = this.extractMemoryValue(info, 'mem_fragmentation_ratio');
            return { used, peak, fragmentation };
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Redis memory info error: ${error.message}`, error.stack, RedisCacheService_1.name);
            return { used: 0, peak: 0, fragmentation: 0 };
        }
    }
    extractMemoryValue(info, key) {
        const match = info.match(new RegExp(`${key}:(\\d+(?:\\.\\d+)?)`));
        return match ? Number.parseFloat(match[1]) : 0;
    }
};
exports.RedisCacheService = RedisCacheService;
exports.RedisCacheService = RedisCacheService = RedisCacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService,
        metrics_service_1.MetricsService])
], RedisCacheService);
//# sourceMappingURL=redis-cache.service.js.map