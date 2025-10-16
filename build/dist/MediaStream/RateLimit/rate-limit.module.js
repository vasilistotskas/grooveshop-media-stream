function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { ConfigModule } from "../Config/config.module.js";
import { ConfigService } from "../Config/config.service.js";
import { MetricsModule } from "../Metrics/metrics.module.js";
import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AdaptiveRateLimitGuard } from "./guards/adaptive-rate-limit.guard.js";
import { RateLimitMetricsService } from "./services/rate-limit-metrics.service.js";
import { RateLimitService } from "./services/rate-limit.service.js";
export class RateLimitModule {
}
RateLimitModule = _ts_decorate([
    Module({
        imports: [
            ConfigModule,
            MetricsModule,
            ThrottlerModule.forRootAsync({
                imports: [
                    ConfigModule
                ],
                inject: [
                    ConfigService
                ],
                useFactory: (_configService)=>({
                        throttlers: [
                            {
                                name: 'default',
                                ttl: _configService.getOptional('rateLimit.default.windowMs', 60000),
                                limit: _configService.getOptional('rateLimit.default.max', 500)
                            },
                            {
                                name: 'image-processing',
                                ttl: _configService.getOptional('rateLimit.imageProcessing.windowMs', 60000),
                                limit: _configService.getOptional('rateLimit.imageProcessing.max', 300)
                            }
                        ],
                        skipIf: (context)=>{
                            const request = context.switchToHttp().getRequest();
                            return request.url?.startsWith('/health');
                        }
                    })
            })
        ],
        providers: [
            RateLimitService,
            AdaptiveRateLimitGuard,
            RateLimitMetricsService
        ],
        exports: [
            RateLimitService,
            AdaptiveRateLimitGuard,
            RateLimitMetricsService
        ]
    })
], RateLimitModule);

//# sourceMappingURL=rate-limit.module.js.map