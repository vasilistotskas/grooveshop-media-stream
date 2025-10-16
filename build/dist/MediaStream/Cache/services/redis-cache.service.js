function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { Buffer } from "node:buffer";
import { ConfigService } from "../../Config/config.service.js";
import { CorrelatedLogger } from "../../Correlation/utils/logger.util.js";
import { MetricsService } from "../../Metrics/services/metrics.service.js";
import { Injectable } from "@nestjs/common";
import Redis from "ioredis";
export class RedisCacheService {
    constructor(_configService, metricsService){
        this._configService = _configService;
        this.metricsService = metricsService;
        this.isConnected = false;
        this.stats = {
            hits: 0,
            misses: 0,
            operations: 0,
            errors: 0
        };
    }
    async onModuleInit() {
        await this.initializeRedis();
    }
    async onModuleDestroy() {
        if (this.redis) {
            await this.redis.quit();
            CorrelatedLogger.log('Redis connection closed', RedisCacheService.name);
        }
    }
    async initializeRedis() {
        try {
            const config = this._configService.get('cache.redis');
            this.redis = new Redis({
                host: config.host,
                port: config.port,
                password: config.password,
                db: config.db,
                maxRetriesPerRequest: config.maxRetries,
                enableReadyCheck: true,
                lazyConnect: true,
                keepAlive: 30000,
                connectTimeout: 10000,
                commandTimeout: 5000
            });
            this.redis.on('connect', ()=>{
                CorrelatedLogger.log('Redis connecting...', RedisCacheService.name);
            });
            this.redis.on('ready', ()=>{
                this.isConnected = true;
                CorrelatedLogger.log('Redis connection ready', RedisCacheService.name);
                this.metricsService.updateActiveConnections('redis', 1);
            });
            this.redis.on('error', (error)=>{
                this.isConnected = false;
                this.stats.errors++;
                CorrelatedLogger.error(`Redis connection error: ${error.message}`, error.stack, RedisCacheService.name);
                this.metricsService.updateActiveConnections('redis', 0);
            });
            this.redis.on('close', ()=>{
                this.isConnected = false;
                CorrelatedLogger.warn('Redis connection closed', RedisCacheService.name);
                this.metricsService.updateActiveConnections('redis', 0);
            });
            this.redis.on('reconnecting', ()=>{
                CorrelatedLogger.log('Redis reconnecting...', RedisCacheService.name);
            });
            await this.redis.connect();
        } catch (error) {
            this.isConnected = false;
            CorrelatedLogger.error(`Failed to initialize Redis: ${error.message}`, error.stack, RedisCacheService.name);
            throw error;
        }
    }
    async get(key) {
        if (!this.isConnected) {
            CorrelatedLogger.warn('Redis not connected, returning null', RedisCacheService.name);
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
                CorrelatedLogger.debug(`Redis cache MISS: ${key}`, RedisCacheService.name);
                return null;
            }
            this.stats.hits++;
            this.metricsService.recordCacheOperation('get', 'redis', 'hit');
            CorrelatedLogger.debug(`Redis cache HIT: ${key}`, RedisCacheService.name);
            return this.deserializeValue(value);
        } catch (error) {
            this.stats.errors++;
            this.stats.misses++;
            this.metricsService.recordCacheOperation('get', 'redis', 'error');
            CorrelatedLogger.error(`Redis cache GET error for key ${key}: ${error.message}`, error.stack, RedisCacheService.name);
            return null;
        }
    }
    async set(key, value, ttl) {
        if (!this.isConnected) {
            CorrelatedLogger.warn('Redis not connected, skipping SET operation', RedisCacheService.name);
            return;
        }
        try {
            this.stats.operations++;
            const serializedValue = this.serializeValue(value);
            const defaultTtl = this._configService.get('cache.redis.ttl');
            const effectiveTtl = ttl !== undefined ? ttl : defaultTtl;
            if (effectiveTtl > 0) {
                await this.redis.setex(key, effectiveTtl, serializedValue);
            } else {
                await this.redis.set(key, serializedValue);
            }
            this.metricsService.recordCacheOperation('set', 'redis', 'success');
            CorrelatedLogger.debug(`Redis cache SET: ${key} (TTL: ${effectiveTtl}s)`, RedisCacheService.name);
        } catch (error) {
            this.stats.errors++;
            this.metricsService.recordCacheOperation('set', 'redis', 'error');
            CorrelatedLogger.error(`Redis cache SET error for key ${key}: ${error.message}`, error.stack, RedisCacheService.name);
        }
    }
    async delete(key) {
        if (!this.isConnected) {
            CorrelatedLogger.warn('Redis not connected, skipping DELETE operation', RedisCacheService.name);
            return;
        }
        try {
            this.stats.operations++;
            await this.redis.del(key);
            this.metricsService.recordCacheOperation('delete', 'redis', 'success');
            CorrelatedLogger.debug(`Redis cache DELETE: ${key}`, RedisCacheService.name);
        } catch (error) {
            this.stats.errors++;
            this.metricsService.recordCacheOperation('delete', 'redis', 'error');
            CorrelatedLogger.error(`Redis cache DELETE error for key ${key}: ${error.message}`, error.stack, RedisCacheService.name);
            throw error;
        }
    }
    async clear() {
        if (!this.isConnected) {
            CorrelatedLogger.warn('Redis not connected, skipping CLEAR operation', RedisCacheService.name);
            return;
        }
        try {
            this.stats.operations++;
            const db = this._configService.get('cache.redis.db');
            await this.redis.flushdb();
            this.metricsService.recordCacheOperation('clear', 'redis', 'success');
            CorrelatedLogger.debug(`Redis cache CLEARED (DB: ${db})`, RedisCacheService.name);
        } catch (error) {
            this.stats.errors++;
            this.metricsService.recordCacheOperation('clear', 'redis', 'error');
            CorrelatedLogger.error(`Redis cache CLEAR error: ${error.message}`, error.stack, RedisCacheService.name);
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
        } catch (error) {
            this.stats.errors++;
            CorrelatedLogger.error(`Redis cache HAS error for key ${key}: ${error.message}`, error.stack, RedisCacheService.name);
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
        } catch (error) {
            this.stats.errors++;
            CorrelatedLogger.error(`Redis cache KEYS error: ${error.message}`, error.stack, RedisCacheService.name);
            return [];
        }
    }
    async flushAll() {
        if (!this.isConnected) {
            CorrelatedLogger.warn('Redis not connected, skipping FLUSH operation', RedisCacheService.name);
            return;
        }
        try {
            this.stats.operations++;
            await this.redis.flushall();
            this.metricsService.recordCacheOperation('flush', 'redis', 'success');
            CorrelatedLogger.debug('Redis cache FLUSHED ALL', RedisCacheService.name);
        } catch (error) {
            this.stats.errors++;
            this.metricsService.recordCacheOperation('flush', 'redis', 'error');
            CorrelatedLogger.error(`Redis cache FLUSH error: ${error.message}`, error.stack, RedisCacheService.name);
            throw error;
        }
    }
    async getStats() {
        try {
            const hitRate = this.stats.hits + this.stats.misses > 0 ? this.stats.hits / (this.stats.hits + this.stats.misses) : 0;
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
                } catch (error) {
                    CorrelatedLogger.warn(`Failed to get Redis info: ${error.message}`, RedisCacheService.name);
                }
            }
            return {
                hits: this.stats.hits,
                misses: this.stats.misses,
                keys,
                ksize: 0,
                vsize: memoryUsage,
                hitRate
            };
        } catch (error) {
            CorrelatedLogger.error(`Redis cache STATS error: ${error.message}`, error.stack, RedisCacheService.name);
            return {
                hits: this.stats.hits,
                misses: this.stats.misses,
                keys: 0,
                ksize: 0,
                vsize: 0,
                hitRate: 0
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
        } catch (error) {
            CorrelatedLogger.error(`Redis TTL error for key ${key}: ${error.message}`, error.stack, RedisCacheService.name);
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
        } catch (error) {
            CorrelatedLogger.error(`Redis EXPIRE error for key ${key}: ${error.message}`, error.stack, RedisCacheService.name);
            return false;
        }
    }
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            stats: {
                ...this.stats
            }
        };
    }
    async getMemoryUsage() {
        if (!this.isConnected) {
            return {
                used: 0,
                peak: 0,
                fragmentation: 0
            };
        }
        try {
            const info = await this.redis.info('memory');
            const used = this.extractMemoryValue(info, 'used_memory');
            const peak = this.extractMemoryValue(info, 'used_memory_peak');
            const fragmentation = this.extractMemoryValue(info, 'mem_fragmentation_ratio');
            return {
                used,
                peak,
                fragmentation
            };
        } catch (error) {
            CorrelatedLogger.error(`Redis memory info error: ${error.message}`, error.stack, RedisCacheService.name);
            return {
                used: 0,
                peak: 0,
                fragmentation: 0
            };
        }
    }
    extractMemoryValue(info, key) {
        const match = info.match(new RegExp(`${key}:(\\d+(?:\\.\\d+)?)`));
        return match ? Number.parseFloat(match[1]) : 0;
    }
    /**
	 * Serialize value for Redis storage, handling Buffers properly
	 */ serializeValue(value) {
        return JSON.stringify(value, (key, val)=>{
            if (Buffer.isBuffer(val)) {
                return {
                    type: 'Buffer',
                    data: val.toString('base64')
                };
            }
            return val;
        });
    }
    /**
	 * Deserialize value from Redis storage, reconstructing Buffers properly
	 */ deserializeValue(value) {
        return JSON.parse(value, (key, val)=>{
            if (val && typeof val === 'object' && val.type === 'Buffer' && typeof val.data === 'string') {
                return Buffer.from(val.data, 'base64');
            }
            return val;
        });
    }
}
RedisCacheService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ConfigService === "undefined" ? Object : ConfigService,
        typeof MetricsService === "undefined" ? Object : MetricsService
    ])
], RedisCacheService);

//# sourceMappingURL=redis-cache.service.js.map