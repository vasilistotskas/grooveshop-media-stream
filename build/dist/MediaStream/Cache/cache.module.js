"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheModule = void 0;
const cache_health_indicator_1 = require("./indicators/cache-health.indicator");
const redis_health_indicator_1 = require("./indicators/redis-health.indicator");
const cache_warming_service_1 = require("./services/cache-warming.service");
const memory_cache_service_1 = require("./services/memory-cache.service");
const redis_cache_service_1 = require("./services/redis-cache.service");
const config_module_1 = require("../Config/config.module");
const metrics_module_1 = require("../Metrics/metrics.module");
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
let CacheModule = class CacheModule {
};
exports.CacheModule = CacheModule;
exports.CacheModule = CacheModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            config_module_1.ConfigModule,
            metrics_module_1.MetricsModule,
        ],
        providers: [
            memory_cache_service_1.MemoryCacheService,
            redis_cache_service_1.RedisCacheService,
            cache_warming_service_1.CacheWarmingService,
            cache_health_indicator_1.CacheHealthIndicator,
            redis_health_indicator_1.RedisHealthIndicator,
        ],
        exports: [
            memory_cache_service_1.MemoryCacheService,
            redis_cache_service_1.RedisCacheService,
            cache_warming_service_1.CacheWarmingService,
            cache_health_indicator_1.CacheHealthIndicator,
            redis_health_indicator_1.RedisHealthIndicator,
        ],
    })
], CacheModule);
//# sourceMappingURL=cache.module.js.map