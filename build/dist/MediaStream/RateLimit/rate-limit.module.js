"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitModule = void 0;
const config_module_1 = require("../Config/config.module");
const config_service_1 = require("../Config/config.service");
const metrics_module_1 = require("../Metrics/metrics.module");
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const adaptive_rate_limit_guard_1 = require("./guards/adaptive-rate-limit.guard");
const rate_limit_metrics_service_1 = require("./services/rate-limit-metrics.service");
const rate_limit_service_1 = require("./services/rate-limit.service");
let RateLimitModule = class RateLimitModule {
};
exports.RateLimitModule = RateLimitModule;
exports.RateLimitModule = RateLimitModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_module_1.ConfigModule,
            metrics_module_1.MetricsModule,
            throttler_1.ThrottlerModule.forRootAsync({
                imports: [config_module_1.ConfigModule],
                inject: [config_service_1.ConfigService],
                useFactory: (configService) => ({
                    throttlers: [
                        {
                            name: 'default',
                            ttl: configService.getOptional('rateLimit.default.windowMs', 60000),
                            limit: configService.getOptional('rateLimit.default.max', 100),
                        },
                        {
                            name: 'image-processing',
                            ttl: configService.getOptional('rateLimit.imageProcessing.windowMs', 60000),
                            limit: configService.getOptional('rateLimit.imageProcessing.max', 50),
                        },
                    ],
                    skipIf: (context) => {
                        const request = context.switchToHttp().getRequest();
                        return request.url?.startsWith('/health');
                    },
                }),
            }),
        ],
        providers: [rate_limit_service_1.RateLimitService, adaptive_rate_limit_guard_1.AdaptiveRateLimitGuard, rate_limit_metrics_service_1.RateLimitMetricsService],
        exports: [rate_limit_service_1.RateLimitService, adaptive_rate_limit_guard_1.AdaptiveRateLimitGuard, rate_limit_metrics_service_1.RateLimitMetricsService],
    })
], RateLimitModule);
//# sourceMappingURL=rate-limit.module.js.map