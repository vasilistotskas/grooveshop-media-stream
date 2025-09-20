"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsModule = void 0;
const config_module_1 = require("../Config/config.module");
const metrics_controller_1 = require("./controllers/metrics.controller");
const metrics_middleware_1 = require("./middleware/metrics.middleware");
const metrics_service_1 = require("./services/metrics.service");
const common_1 = require("@nestjs/common");
let MetricsModule = class MetricsModule {
    configure(consumer) {
        consumer.apply(metrics_middleware_1.MetricsMiddleware).forRoutes('*');
    }
};
exports.MetricsModule = MetricsModule;
exports.MetricsModule = MetricsModule = __decorate([
    (0, common_1.Module)({
        imports: [config_module_1.ConfigModule],
        controllers: [metrics_controller_1.MetricsController],
        providers: [metrics_service_1.MetricsService, metrics_middleware_1.MetricsMiddleware],
        exports: [metrics_service_1.MetricsService],
    })
], MetricsModule);
//# sourceMappingURL=metrics.module.js.map