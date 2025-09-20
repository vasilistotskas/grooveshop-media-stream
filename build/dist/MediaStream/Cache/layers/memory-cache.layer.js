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
exports.MemoryCacheLayer = void 0;
const common_1 = require("@nestjs/common");
const memory_cache_service_1 = require("../services/memory-cache.service");
let MemoryCacheLayer = class MemoryCacheLayer {
    constructor(memoryCacheService) {
        this.memoryCacheService = memoryCacheService;
        this.layerName = 'memory';
        this.priority = 1;
    }
    async get(key) {
        return this.memoryCacheService.get(key);
    }
    async set(key, value, ttl) {
        await this.memoryCacheService.set(key, value, ttl);
    }
    async delete(key) {
        await this.memoryCacheService.delete(key);
    }
    async exists(key) {
        return this.memoryCacheService.has(key);
    }
    async clear() {
        await this.memoryCacheService.clear();
    }
    async getStats() {
        const stats = await this.memoryCacheService.getStats();
        return {
            hits: stats.hits,
            misses: stats.misses,
            keys: stats.keys,
            hitRate: stats.hitRate,
            memoryUsage: stats.memoryUsage || (stats.vsize + stats.ksize),
            errors: 0,
        };
    }
    getLayerName() {
        return this.layerName;
    }
    getPriority() {
        return this.priority;
    }
};
exports.MemoryCacheLayer = MemoryCacheLayer;
exports.MemoryCacheLayer = MemoryCacheLayer = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [memory_cache_service_1.MemoryCacheService])
], MemoryCacheLayer);
//# sourceMappingURL=memory-cache.layer.js.map