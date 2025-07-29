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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisCacheLayer = void 0;
const common_1 = require("@nestjs/common");
const redis_cache_service_1 = require("../services/redis-cache.service");
let RedisCacheLayer = class RedisCacheLayer {
    constructor(redisCacheService) {
        this.redisCacheService = redisCacheService;
        this.layerName = 'redis';
        this.priority = 2;
    }
    async get(key) {
        try {
            return await this.redisCacheService.get(key);
        }
        catch {
            return null;
        }
    }
    async set(key, value, ttl) {
        try {
            await this.redisCacheService.set(key, value, ttl);
        }
        catch {
        }
    }
    async delete(key) {
        try {
            await this.redisCacheService.delete(key);
        }
        catch {
        }
    }
    async exists(key) {
        try {
            return await this.redisCacheService.has(key);
        }
        catch {
            return false;
        }
    }
    async clear() {
        try {
            await this.redisCacheService.clear();
        }
        catch {
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
                errors: connectionStatus.stats.errors,
            };
        }
        catch {
            return {
                hits: 0,
                misses: 0,
                keys: 0,
                hitRate: 0,
                errors: 1,
            };
        }
    }
    getLayerName() {
        return this.layerName;
    }
    getPriority() {
        return this.priority;
    }
};
exports.RedisCacheLayer = RedisCacheLayer;
exports.RedisCacheLayer = RedisCacheLayer = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_cache_service_1.RedisCacheService])
], RedisCacheLayer);
//# sourceMappingURL=redis-cache.layer.js.map