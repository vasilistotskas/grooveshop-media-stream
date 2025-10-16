function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { CacheConfigDto } from "./cache-config.dto.js";
import { HttpConfigDto } from "./http-config.dto.js";
import { MonitoringConfigDto } from "./monitoring-config.dto.js";
import { ProcessingConfigDto } from "./processing-config.dto.js";
import { RateLimitConfigDto } from "./rate-limit-config.dto.js";
import { ServerConfigDto } from "./server-config.dto.js";
import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";
import { ExternalServicesConfigDto } from "./external-services-config.dto.js";
export class AppConfigDto {
    constructor(){
        this.server = new ServerConfigDto();
        this.cache = new CacheConfigDto();
        this.processing = new ProcessingConfigDto();
        this.monitoring = new MonitoringConfigDto();
        this.externalServices = new ExternalServicesConfigDto();
        this.http = new HttpConfigDto();
        this.rateLimit = new RateLimitConfigDto();
    }
}
_ts_decorate([
    ValidateNested(),
    Type(()=>ServerConfigDto),
    _ts_metadata("design:type", typeof ServerConfigDto === "undefined" ? Object : ServerConfigDto)
], AppConfigDto.prototype, "server", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>CacheConfigDto),
    _ts_metadata("design:type", typeof CacheConfigDto === "undefined" ? Object : CacheConfigDto)
], AppConfigDto.prototype, "cache", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>ProcessingConfigDto),
    _ts_metadata("design:type", typeof ProcessingConfigDto === "undefined" ? Object : ProcessingConfigDto)
], AppConfigDto.prototype, "processing", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>MonitoringConfigDto),
    _ts_metadata("design:type", typeof MonitoringConfigDto === "undefined" ? Object : MonitoringConfigDto)
], AppConfigDto.prototype, "monitoring", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>ExternalServicesConfigDto),
    _ts_metadata("design:type", typeof ExternalServicesConfigDto === "undefined" ? Object : ExternalServicesConfigDto)
], AppConfigDto.prototype, "externalServices", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>HttpConfigDto),
    _ts_metadata("design:type", typeof HttpConfigDto === "undefined" ? Object : HttpConfigDto)
], AppConfigDto.prototype, "http", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>RateLimitConfigDto),
    _ts_metadata("design:type", typeof RateLimitConfigDto === "undefined" ? Object : RateLimitConfigDto)
], AppConfigDto.prototype, "rateLimit", void 0);

//# sourceMappingURL=app-config.dto.js.map