function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { Transform } from "class-transformer";
import { IsNumber, IsString, IsUrl, Max, Min } from "class-validator";
export class ExternalServicesConfigDto {
    constructor(){
        this.djangoUrl = 'http://localhost:8000';
        this.nuxtUrl = 'http://localhost:3000';
        this.requestTimeout = 30000;
        this.maxRetries = 3;
    }
}
_ts_decorate([
    IsString(),
    IsUrl({
        require_tld: false
    }, {
        message: 'Django URL must be a valid URL'
    }),
    Transform(({ value })=>value || 'http://localhost:8000'),
    _ts_metadata("design:type", String)
], ExternalServicesConfigDto.prototype, "djangoUrl", void 0);
_ts_decorate([
    IsString(),
    IsUrl({
        require_tld: false
    }, {
        message: 'Nuxt URL must be a valid URL'
    }),
    Transform(({ value })=>value || 'http://localhost:3000'),
    _ts_metadata("design:type", String)
], ExternalServicesConfigDto.prototype, "nuxtUrl", void 0);
_ts_decorate([
    IsNumber(),
    Min(1000),
    Max(300000),
    Transform(({ value })=>Number.parseInt(value) || 30000),
    _ts_metadata("design:type", Number)
], ExternalServicesConfigDto.prototype, "requestTimeout", void 0);
_ts_decorate([
    IsNumber(),
    Min(0),
    Max(10),
    Transform(({ value })=>Number.parseInt(value) || 3),
    _ts_metadata("design:type", Number)
], ExternalServicesConfigDto.prototype, "maxRetries", void 0);

//# sourceMappingURL=external-services-config.dto.js.map