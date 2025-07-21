"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthModule = void 0;
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const health_controller_1 = require("./controllers/health.controller");
const disk_space_health_indicator_1 = require("./indicators/disk-space-health.indicator");
const memory_health_indicator_1 = require("./indicators/memory-health.indicator");
const config_module_1 = require("../Config/config.module");
const http_module_1 = require("../HTTP/http.module");
const http_health_indicator_1 = require("../HTTP/indicators/http-health.indicator");
let HealthModule = class HealthModule {
};
exports.HealthModule = HealthModule;
exports.HealthModule = HealthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            terminus_1.TerminusModule,
            config_module_1.ConfigModule,
            http_module_1.HttpModule
        ],
        controllers: [health_controller_1.HealthController],
        providers: [
            disk_space_health_indicator_1.DiskSpaceHealthIndicator,
            memory_health_indicator_1.MemoryHealthIndicator,
            http_health_indicator_1.HttpHealthIndicator
        ],
        exports: [
            disk_space_health_indicator_1.DiskSpaceHealthIndicator,
            memory_health_indicator_1.MemoryHealthIndicator,
            http_health_indicator_1.HttpHealthIndicator
        ]
    })
], HealthModule);
//# sourceMappingURL=health.module.js.map