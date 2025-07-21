"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CorrelationModule = void 0;
const common_1 = require("@nestjs/common");
const correlation_service_1 = require("./services/correlation.service");
const correlation_middleware_1 = require("./middleware/correlation.middleware");
const timing_middleware_1 = require("./middleware/timing.middleware");
let CorrelationModule = class CorrelationModule {
    configure(consumer) {
        consumer
            .apply(correlation_middleware_1.CorrelationMiddleware, timing_middleware_1.TimingMiddleware)
            .forRoutes('*');
    }
};
exports.CorrelationModule = CorrelationModule;
exports.CorrelationModule = CorrelationModule = __decorate([
    (0, common_1.Module)({
        providers: [correlation_service_1.CorrelationService],
        exports: [correlation_service_1.CorrelationService],
    })
], CorrelationModule);
//# sourceMappingURL=correlation.module.js.map