function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { CacheHealthIndicator } from "./indicators/cache-health.indicator.js";
import { RedisHealthIndicator } from "./indicators/redis-health.indicator.js";
import { FileCacheLayer } from "./layers/file-cache.layer.js";
import { MemoryCacheLayer } from "./layers/memory-cache.layer.js";
import { RedisCacheLayer } from "./layers/redis-cache.layer.js";
import { CacheWarmingService } from "./services/cache-warming.service.js";
import { MemoryCacheService } from "./services/memory-cache.service.js";
import { MultiLayerCacheManager } from "./services/multi-layer-cache.manager.js";
import { RedisCacheService } from "./services/redis-cache.service.js";
import { DefaultCacheKeyStrategy } from "./strategies/cache-key.strategy.js";
import { ConfigModule } from "../Config/config.module.js";
import { MetricsModule } from "../Metrics/metrics.module.js";
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
export class CacheModule {
}
CacheModule = _ts_decorate([
    Module({
        imports: [
            ScheduleModule.forRoot(),
            ConfigModule,
            MetricsModule
        ],
        providers: [
            MemoryCacheService,
            RedisCacheService,
            CacheWarmingService,
            MultiLayerCacheManager,
            CacheHealthIndicator,
            RedisHealthIndicator,
            DefaultCacheKeyStrategy,
            MemoryCacheLayer,
            RedisCacheLayer,
            FileCacheLayer
        ],
        exports: [
            MemoryCacheService,
            RedisCacheService,
            CacheWarmingService,
            MultiLayerCacheManager,
            CacheHealthIndicator,
            RedisHealthIndicator,
            DefaultCacheKeyStrategy,
            MemoryCacheLayer,
            RedisCacheLayer,
            FileCacheLayer
        ]
    })
], CacheModule);

//# sourceMappingURL=cache.module.js.map