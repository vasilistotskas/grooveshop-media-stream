"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitConfigDto = exports.BypassConfigDto = exports.AdaptiveConfigDto = exports.SystemLoadThresholdsDto = exports.RateLimitThrottlerConfigDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class RateLimitThrottlerConfigDto {
    constructor(data) {
        this.windowMs = 60000;
        this.max = 100;
        this.skipSuccessfulRequests = false;
        this.skipFailedRequests = false;
        if (data) {
            Object.assign(this, data);
        }
    }
}
exports.RateLimitThrottlerConfigDto = RateLimitThrottlerConfigDto;
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1000),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value, 10)),
    __metadata("design:type", Number)
], RateLimitThrottlerConfigDto.prototype, "windowMs", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value, 10)),
    __metadata("design:type", Number)
], RateLimitThrottlerConfigDto.prototype, "max", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true'),
    __metadata("design:type", Boolean)
], RateLimitThrottlerConfigDto.prototype, "skipSuccessfulRequests", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true'),
    __metadata("design:type", Boolean)
], RateLimitThrottlerConfigDto.prototype, "skipFailedRequests", void 0);
class SystemLoadThresholdsDto {
    constructor() {
        this.cpu = 80;
        this.memory = 85;
        this.connections = 1000;
    }
}
exports.SystemLoadThresholdsDto = SystemLoadThresholdsDto;
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseFloat(value)),
    __metadata("design:type", Number)
], SystemLoadThresholdsDto.prototype, "cpu", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseFloat(value)),
    __metadata("design:type", Number)
], SystemLoadThresholdsDto.prototype, "memory", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value, 10)),
    __metadata("design:type", Number)
], SystemLoadThresholdsDto.prototype, "connections", void 0);
class AdaptiveConfigDto {
    constructor() {
        this.enabled = true;
        this.systemLoadThresholds = new SystemLoadThresholdsDto();
        this.maxReduction = 0.5;
        this.minLimit = 1;
    }
}
exports.AdaptiveConfigDto = AdaptiveConfigDto;
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true'),
    __metadata("design:type", Boolean)
], AdaptiveConfigDto.prototype, "enabled", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => SystemLoadThresholdsDto),
    __metadata("design:type", SystemLoadThresholdsDto)
], AdaptiveConfigDto.prototype, "systemLoadThresholds", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseFloat(value)),
    __metadata("design:type", Number)
], AdaptiveConfigDto.prototype, "maxReduction", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value, 10)),
    __metadata("design:type", Number)
], AdaptiveConfigDto.prototype, "minLimit", void 0);
class BypassConfigDto {
    constructor() {
        this.healthChecks = true;
        this.metricsEndpoint = true;
        this.staticAssets = true;
        this.customPaths = [];
        this.whitelistedDomains = [];
    }
}
exports.BypassConfigDto = BypassConfigDto;
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true'),
    __metadata("design:type", Boolean)
], BypassConfigDto.prototype, "healthChecks", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true'),
    __metadata("design:type", Boolean)
], BypassConfigDto.prototype, "metricsEndpoint", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true'),
    __metadata("design:type", Boolean)
], BypassConfigDto.prototype, "staticAssets", void 0);
__decorate([
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], BypassConfigDto.prototype, "customPaths", void 0);
__decorate([
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], BypassConfigDto.prototype, "whitelistedDomains", void 0);
class RateLimitConfigDto {
    constructor() {
        this.default = new RateLimitThrottlerConfigDto();
        this.imageProcessing = new RateLimitThrottlerConfigDto({
            windowMs: 60000,
            max: 50,
            skipSuccessfulRequests: false,
            skipFailedRequests: false,
        });
        this.healthCheck = new RateLimitThrottlerConfigDto({
            windowMs: 10000,
            max: 1000,
            skipSuccessfulRequests: true,
            skipFailedRequests: true,
        });
        this.adaptive = new AdaptiveConfigDto();
        this.bypass = new BypassConfigDto();
        this.enabled = true;
        this.logBlocked = true;
    }
}
exports.RateLimitConfigDto = RateLimitConfigDto;
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => RateLimitThrottlerConfigDto),
    __metadata("design:type", RateLimitThrottlerConfigDto)
], RateLimitConfigDto.prototype, "default", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => RateLimitThrottlerConfigDto),
    __metadata("design:type", RateLimitThrottlerConfigDto)
], RateLimitConfigDto.prototype, "imageProcessing", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => RateLimitThrottlerConfigDto),
    __metadata("design:type", RateLimitThrottlerConfigDto)
], RateLimitConfigDto.prototype, "healthCheck", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AdaptiveConfigDto),
    __metadata("design:type", AdaptiveConfigDto)
], RateLimitConfigDto.prototype, "adaptive", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => BypassConfigDto),
    __metadata("design:type", BypassConfigDto)
], RateLimitConfigDto.prototype, "bypass", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true'),
    __metadata("design:type", Boolean)
], RateLimitConfigDto.prototype, "enabled", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true'),
    __metadata("design:type", Boolean)
], RateLimitConfigDto.prototype, "logBlocked", void 0);
//# sourceMappingURL=rate-limit-config.dto.js.map