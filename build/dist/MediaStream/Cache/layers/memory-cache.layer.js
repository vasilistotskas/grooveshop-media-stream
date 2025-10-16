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
import { MemoryCacheService } from "../services/memory-cache.service.js";
export class MemoryCacheLayer {
    constructor(memoryCacheService){
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
            memoryUsage: stats.memoryUsage || stats.vsize + stats.ksize,
            errors: 0
        };
    }
    getLayerName() {
        return this.layerName;
    }
    getPriority() {
        return this.priority;
    }
}
MemoryCacheLayer = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof MemoryCacheService === "undefined" ? Object : MemoryCacheService
    ])
], MemoryCacheLayer);

//# sourceMappingURL=memory-cache.layer.js.map