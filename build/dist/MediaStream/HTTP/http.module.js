function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { ConfigModule } from "../Config/config.module.js";
import { HttpHealthIndicator } from "./indicators/http-health.indicator.js";
import { HttpClientService } from "./services/http-client.service.js";
import { HttpModule as NestHttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
export class HttpModule {
}
HttpModule = _ts_decorate([
    Module({
        imports: [
            NestHttpModule.register({}),
            ConfigModule
        ],
        providers: [
            HttpClientService,
            HttpHealthIndicator
        ],
        exports: [
            HttpClientService,
            HttpHealthIndicator,
            NestHttpModule
        ]
    })
], HttpModule);

//# sourceMappingURL=http.module.js.map