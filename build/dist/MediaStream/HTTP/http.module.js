"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_module_1 = require("../Config/config.module");
const http_client_service_1 = require("./services/http-client.service");
const http_health_indicator_1 = require("./indicators/http-health.indicator");
let HttpModule = class HttpModule {
};
exports.HttpModule = HttpModule;
exports.HttpModule = HttpModule = __decorate([
    (0, common_1.Module)({
        imports: [
            axios_1.HttpModule.register({}),
            config_module_1.ConfigModule,
        ],
        providers: [
            http_client_service_1.HttpClientService,
            http_health_indicator_1.HttpHealthIndicator,
        ],
        exports: [
            http_client_service_1.HttpClientService,
            http_health_indicator_1.HttpHealthIndicator,
        ],
    })
], HttpModule);
//# sourceMappingURL=http.module.js.map