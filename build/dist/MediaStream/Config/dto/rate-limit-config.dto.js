function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
export class RateLimitThrottlerConfigDto {
    constructor(data){
        this.windowMs = 60000;
        this.max = 100;
        this.skipSuccessfulRequests = false;
        this.skipFailedRequests = false;
        if (data) {
            Object.assign(this, data);
        }
    }
}
_ts_decorate([
    IsNumber(),
    Min(1000),
    Transform(({ value })=>Number.parseInt(value, 10)),
    _ts_metadata("design:type", Number)
], RateLimitThrottlerConfigDto.prototype, "windowMs", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value, 10)),
    _ts_metadata("design:type", Number)
], RateLimitThrottlerConfigDto.prototype, "max", void 0);
_ts_decorate([
    IsBoolean(),
    IsOptional(),
    Transform(({ value })=>value === 'true'),
    _ts_metadata("design:type", Boolean)
], RateLimitThrottlerConfigDto.prototype, "skipSuccessfulRequests", void 0);
_ts_decorate([
    IsBoolean(),
    IsOptional(),
    Transform(({ value })=>value === 'true'),
    _ts_metadata("design:type", Boolean)
], RateLimitThrottlerConfigDto.prototype, "skipFailedRequests", void 0);
export class SystemLoadThresholdsDto {
    constructor(){
        this.cpu = 80;
        this.memory = 85;
        this.connections = 1000;
    }
}
_ts_decorate([
    IsNumber(),
    Min(0),
    Transform(({ value })=>Number.parseFloat(value)),
    _ts_metadata("design:type", Number)
], SystemLoadThresholdsDto.prototype, "cpu", void 0);
_ts_decorate([
    IsNumber(),
    Min(0),
    Transform(({ value })=>Number.parseFloat(value)),
    _ts_metadata("design:type", Number)
], SystemLoadThresholdsDto.prototype, "memory", void 0);
_ts_decorate([
    IsNumber(),
    Min(0),
    Transform(({ value })=>Number.parseInt(value, 10)),
    _ts_metadata("design:type", Number)
], SystemLoadThresholdsDto.prototype, "connections", void 0);
export class AdaptiveConfigDto {
    constructor(){
        this.enabled = true;
        this.systemLoadThresholds = new SystemLoadThresholdsDto();
        this.maxReduction = 0.5;
        this.minLimit = 1;
    }
}
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true'),
    _ts_metadata("design:type", Boolean)
], AdaptiveConfigDto.prototype, "enabled", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>SystemLoadThresholdsDto),
    _ts_metadata("design:type", typeof SystemLoadThresholdsDto === "undefined" ? Object : SystemLoadThresholdsDto)
], AdaptiveConfigDto.prototype, "systemLoadThresholds", void 0);
_ts_decorate([
    IsNumber(),
    Min(0),
    Transform(({ value })=>Number.parseFloat(value)),
    _ts_metadata("design:type", Number)
], AdaptiveConfigDto.prototype, "maxReduction", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value, 10)),
    _ts_metadata("design:type", Number)
], AdaptiveConfigDto.prototype, "minLimit", void 0);
export class BypassConfigDto {
    constructor(){
        this.healthChecks = true;
        this.metricsEndpoint = true;
        this.staticAssets = true;
        this.bots = true;
        this.customPaths = [];
        this.whitelistedDomains = [];
    }
}
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true'),
    _ts_metadata("design:type", Boolean)
], BypassConfigDto.prototype, "healthChecks", void 0);
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true'),
    _ts_metadata("design:type", Boolean)
], BypassConfigDto.prototype, "metricsEndpoint", void 0);
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true'),
    _ts_metadata("design:type", Boolean)
], BypassConfigDto.prototype, "staticAssets", void 0);
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true'),
    _ts_metadata("design:type", Boolean)
], BypassConfigDto.prototype, "bots", void 0);
_ts_decorate([
    IsString({
        each: true
    }),
    IsOptional(),
    _ts_metadata("design:type", Array)
], BypassConfigDto.prototype, "customPaths", void 0);
_ts_decorate([
    IsString({
        each: true
    }),
    IsOptional(),
    _ts_metadata("design:type", Array)
], BypassConfigDto.prototype, "whitelistedDomains", void 0);
export class RateLimitConfigDto {
    constructor(){
        this.default = new RateLimitThrottlerConfigDto();
        this.imageProcessing = new RateLimitThrottlerConfigDto({
            windowMs: 60000,
            max: 50,
            skipSuccessfulRequests: false,
            skipFailedRequests: false
        });
        this.healthCheck = new RateLimitThrottlerConfigDto({
            windowMs: 10000,
            max: 1000,
            skipSuccessfulRequests: true,
            skipFailedRequests: true
        });
        this.adaptive = new AdaptiveConfigDto();
        this.bypass = new BypassConfigDto();
        this.enabled = true;
        this.logBlocked = true;
    }
}
_ts_decorate([
    ValidateNested(),
    Type(()=>RateLimitThrottlerConfigDto),
    _ts_metadata("design:type", typeof RateLimitThrottlerConfigDto === "undefined" ? Object : RateLimitThrottlerConfigDto)
], RateLimitConfigDto.prototype, "default", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>RateLimitThrottlerConfigDto),
    _ts_metadata("design:type", typeof RateLimitThrottlerConfigDto === "undefined" ? Object : RateLimitThrottlerConfigDto)
], RateLimitConfigDto.prototype, "imageProcessing", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>RateLimitThrottlerConfigDto),
    _ts_metadata("design:type", typeof RateLimitThrottlerConfigDto === "undefined" ? Object : RateLimitThrottlerConfigDto)
], RateLimitConfigDto.prototype, "healthCheck", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>AdaptiveConfigDto),
    _ts_metadata("design:type", typeof AdaptiveConfigDto === "undefined" ? Object : AdaptiveConfigDto)
], RateLimitConfigDto.prototype, "adaptive", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>BypassConfigDto),
    _ts_metadata("design:type", typeof BypassConfigDto === "undefined" ? Object : BypassConfigDto)
], RateLimitConfigDto.prototype, "bypass", void 0);
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true'),
    _ts_metadata("design:type", Boolean)
], RateLimitConfigDto.prototype, "enabled", void 0);
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true'),
    _ts_metadata("design:type", Boolean)
], RateLimitConfigDto.prototype, "logBlocked", void 0);

//# sourceMappingURL=rate-limit-config.dto.js.map