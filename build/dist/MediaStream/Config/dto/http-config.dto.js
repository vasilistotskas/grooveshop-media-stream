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
import { IsBoolean, IsNumber, Min, ValidateNested } from "class-validator";
export class CircuitBreakerConfigDto {
    constructor(){
        this.enabled = false;
        this.failureThreshold = 5;
        this.resetTimeout = 60000;
        this.monitoringPeriod = 30000;
    }
}
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true' || value === true || false),
    _ts_metadata("design:type", Boolean)
], CircuitBreakerConfigDto.prototype, "enabled", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value) || 5),
    _ts_metadata("design:type", Number)
], CircuitBreakerConfigDto.prototype, "failureThreshold", void 0);
_ts_decorate([
    IsNumber(),
    Min(1000),
    Transform(({ value })=>Number.parseInt(value) || 60000),
    _ts_metadata("design:type", Number)
], CircuitBreakerConfigDto.prototype, "resetTimeout", void 0);
_ts_decorate([
    IsNumber(),
    Min(1000),
    Transform(({ value })=>Number.parseInt(value) || 30000),
    _ts_metadata("design:type", Number)
], CircuitBreakerConfigDto.prototype, "monitoringPeriod", void 0);
export class ConnectionPoolConfigDto {
    constructor(){
        this.maxSockets = 50;
        this.maxFreeSockets = 10;
        this.timeout = 30000;
        this.keepAlive = true;
        this.keepAliveMsecs = 1000;
        this.connectTimeout = 5000;
    }
}
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value) || 50),
    _ts_metadata("design:type", Number)
], ConnectionPoolConfigDto.prototype, "maxSockets", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value) || 10),
    _ts_metadata("design:type", Number)
], ConnectionPoolConfigDto.prototype, "maxFreeSockets", void 0);
_ts_decorate([
    IsNumber(),
    Min(100),
    Transform(({ value })=>Number.parseInt(value) || 30000),
    _ts_metadata("design:type", Number)
], ConnectionPoolConfigDto.prototype, "timeout", void 0);
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true' || value === true),
    _ts_metadata("design:type", Boolean)
], ConnectionPoolConfigDto.prototype, "keepAlive", void 0);
_ts_decorate([
    IsNumber(),
    Min(100),
    Transform(({ value })=>Number.parseInt(value) || 1000),
    _ts_metadata("design:type", Number)
], ConnectionPoolConfigDto.prototype, "keepAliveMsecs", void 0);
_ts_decorate([
    IsNumber(),
    Min(100),
    Transform(({ value })=>Number.parseInt(value) || 5000),
    _ts_metadata("design:type", Number)
], ConnectionPoolConfigDto.prototype, "connectTimeout", void 0);
export class RetryConfigDto {
    constructor(){
        this.retries = 3;
        this.retryDelay = 1000;
        this.retryDelayMultiplier = 2;
        this.maxRetryDelay = 10000;
        this.retryOnTimeout = true;
        this.retryOnConnectionError = true;
    }
}
_ts_decorate([
    IsNumber(),
    Min(0),
    Transform(({ value })=>Number.parseInt(value) || 3),
    _ts_metadata("design:type", Number)
], RetryConfigDto.prototype, "retries", void 0);
_ts_decorate([
    IsNumber(),
    Min(100),
    Transform(({ value })=>Number.parseInt(value) || 1000),
    _ts_metadata("design:type", Number)
], RetryConfigDto.prototype, "retryDelay", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value) || 2),
    _ts_metadata("design:type", Number)
], RetryConfigDto.prototype, "retryDelayMultiplier", void 0);
_ts_decorate([
    IsNumber(),
    Min(1000),
    Transform(({ value })=>Number.parseInt(value) || 10000),
    _ts_metadata("design:type", Number)
], RetryConfigDto.prototype, "maxRetryDelay", void 0);
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true' || value === true),
    _ts_metadata("design:type", Boolean)
], RetryConfigDto.prototype, "retryOnTimeout", void 0);
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true' || value === true),
    _ts_metadata("design:type", Boolean)
], RetryConfigDto.prototype, "retryOnConnectionError", void 0);
export class HttpConfigDto {
    constructor(){
        this.circuitBreaker = new CircuitBreakerConfigDto();
        this.connectionPool = new ConnectionPoolConfigDto();
        this.retry = new RetryConfigDto();
    }
}
_ts_decorate([
    ValidateNested(),
    Type(()=>CircuitBreakerConfigDto),
    _ts_metadata("design:type", typeof CircuitBreakerConfigDto === "undefined" ? Object : CircuitBreakerConfigDto)
], HttpConfigDto.prototype, "circuitBreaker", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>ConnectionPoolConfigDto),
    _ts_metadata("design:type", typeof ConnectionPoolConfigDto === "undefined" ? Object : ConnectionPoolConfigDto)
], HttpConfigDto.prototype, "connectionPool", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>RetryConfigDto),
    _ts_metadata("design:type", typeof RetryConfigDto === "undefined" ? Object : RetryConfigDto)
], HttpConfigDto.prototype, "retry", void 0);

//# sourceMappingURL=http-config.dto.js.map