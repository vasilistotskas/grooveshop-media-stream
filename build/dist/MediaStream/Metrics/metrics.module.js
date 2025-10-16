function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { ConfigModule } from "../Config/config.module.js";
import { MetricsController } from "./controllers/metrics.controller.js";
import { MetricsMiddleware } from "./middleware/metrics.middleware.js";
import { MetricsService } from "./services/metrics.service.js";
import { Module } from "@nestjs/common";
export class MetricsModule {
    configure(consumer) {
        consumer.apply(MetricsMiddleware).forRoutes('*');
    }
}
MetricsModule = _ts_decorate([
    Module({
        imports: [
            ConfigModule
        ],
        controllers: [
            MetricsController
        ],
        providers: [
            MetricsService,
            MetricsMiddleware
        ],
        exports: [
            MetricsService
        ]
    })
], MetricsModule);

//# sourceMappingURL=metrics.module.js.map