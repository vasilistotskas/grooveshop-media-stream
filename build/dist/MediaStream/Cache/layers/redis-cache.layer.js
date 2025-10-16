function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { Injectable } from "@nestjs/common";
import { RedisCacheService } from "../services/redis-cache.service.js";
export class RedisCacheLayer {
    constructor(redisCacheService){
        this.redisCacheService = redisCacheService;
        this.layerName = 'redis';
        this.priority = 2;
    }
    async get(key) {
        try {
            return await this.redisCacheService.get(key);
        } catch  {
            return null;
        }
    }
    async set(key, value, ttl) {
        try {
            await this.redisCacheService.set(key, value, ttl);
        } catch  {
        // Silently fail for Redis layer
        }
    }
    async delete(key) {
        try {
            await this.redisCacheService.delete(key);
        } catch  {
        // Silently fail for Redis layer
        }
    }
    async exists(key) {
        try {
            return await this.redisCacheService.has(key);
        } catch  {
            return false;
        }
    }
    async clear() {
        try {
            await this.redisCacheService.clear();
        } catch  {
        // Silently fail for Redis layer
        }
    }
    async getStats() {
        try {
            const stats = await this.redisCacheService.getStats();
            const connectionStatus = this.redisCacheService.getConnectionStatus();
            return {
                hits: stats.hits,
                misses: stats.misses,
                keys: stats.keys,
                hitRate: stats.hitRate,
                errors: connectionStatus.stats.errors
            };
        } catch  {
            return {
                hits: 0,
                misses: 0,
                keys: 0,
                hitRate: 0,
                errors: 1
            };
        }
    }
    getLayerName() {
        return this.layerName;
    }
    getPriority() {
        return this.priority;
    }
}
RedisCacheLayer = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof RedisCacheService === "undefined" ? Object : RedisCacheService
    ])
], RedisCacheLayer);

//# sourceMappingURL=redis-cache.layer.js.map