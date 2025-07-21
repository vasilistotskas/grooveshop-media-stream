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
exports.HttpConfigDto = exports.RetryConfigDto = exports.ConnectionPoolConfigDto = exports.CircuitBreakerConfigDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class CircuitBreakerConfigDto {
    constructor() {
        this.enabled = false;
        this.failureThreshold = 5;
        this.resetTimeout = 60000;
        this.monitoringPeriod = 30000;
    }
}
exports.CircuitBreakerConfigDto = CircuitBreakerConfigDto;
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true || false),
    __metadata("design:type", Boolean)
], CircuitBreakerConfigDto.prototype, "enabled", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 5),
    __metadata("design:type", Number)
], CircuitBreakerConfigDto.prototype, "failureThreshold", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1000),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 60000),
    __metadata("design:type", Number)
], CircuitBreakerConfigDto.prototype, "resetTimeout", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1000),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 30000),
    __metadata("design:type", Number)
], CircuitBreakerConfigDto.prototype, "monitoringPeriod", void 0);
class ConnectionPoolConfigDto {
    constructor() {
        this.maxSockets = 50;
        this.maxFreeSockets = 10;
        this.timeout = 30000;
        this.keepAlive = true;
        this.keepAliveMsecs = 1000;
        this.connectTimeout = 5000;
    }
}
exports.ConnectionPoolConfigDto = ConnectionPoolConfigDto;
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 50),
    __metadata("design:type", Number)
], ConnectionPoolConfigDto.prototype, "maxSockets", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 10),
    __metadata("design:type", Number)
], ConnectionPoolConfigDto.prototype, "maxFreeSockets", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(100),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 30000),
    __metadata("design:type", Number)
], ConnectionPoolConfigDto.prototype, "timeout", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true),
    __metadata("design:type", Boolean)
], ConnectionPoolConfigDto.prototype, "keepAlive", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(100),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 1000),
    __metadata("design:type", Number)
], ConnectionPoolConfigDto.prototype, "keepAliveMsecs", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(100),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 5000),
    __metadata("design:type", Number)
], ConnectionPoolConfigDto.prototype, "connectTimeout", void 0);
class RetryConfigDto {
    constructor() {
        this.retries = 3;
        this.retryDelay = 1000;
        this.retryDelayMultiplier = 2;
        this.maxRetryDelay = 10000;
        this.retryOnTimeout = true;
        this.retryOnConnectionError = true;
    }
}
exports.RetryConfigDto = RetryConfigDto;
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 3),
    __metadata("design:type", Number)
], RetryConfigDto.prototype, "retries", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(100),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 1000),
    __metadata("design:type", Number)
], RetryConfigDto.prototype, "retryDelay", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 2),
    __metadata("design:type", Number)
], RetryConfigDto.prototype, "retryDelayMultiplier", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1000),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 10000),
    __metadata("design:type", Number)
], RetryConfigDto.prototype, "maxRetryDelay", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true),
    __metadata("design:type", Boolean)
], RetryConfigDto.prototype, "retryOnTimeout", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true),
    __metadata("design:type", Boolean)
], RetryConfigDto.prototype, "retryOnConnectionError", void 0);
class HttpConfigDto {
    constructor() {
        this.circuitBreaker = new CircuitBreakerConfigDto();
        this.connectionPool = new ConnectionPoolConfigDto();
        this.retry = new RetryConfigDto();
    }
}
exports.HttpConfigDto = HttpConfigDto;
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => CircuitBreakerConfigDto),
    __metadata("design:type", CircuitBreakerConfigDto)
], HttpConfigDto.prototype, "circuitBreaker", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ConnectionPoolConfigDto),
    __metadata("design:type", ConnectionPoolConfigDto)
], HttpConfigDto.prototype, "connectionPool", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => RetryConfigDto),
    __metadata("design:type", RetryConfigDto)
], HttpConfigDto.prototype, "retry", void 0);
//# sourceMappingURL=http-config.dto.js.map