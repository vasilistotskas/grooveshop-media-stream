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
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
export class MemoryCacheConfigDto {
    constructor(){
        this.maxSize = 104857600;
        this.ttl = 3600;
        this.checkPeriod = 600;
        this.useClones = false;
        this.deleteOnExpire = true;
    }
}
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value) || 104857600),
    _ts_metadata("design:type", Number)
], MemoryCacheConfigDto.prototype, "maxSize", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value) || 3600),
    _ts_metadata("design:type", Number)
], MemoryCacheConfigDto.prototype, "ttl", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value) || 600),
    _ts_metadata("design:type", Number)
], MemoryCacheConfigDto.prototype, "checkPeriod", void 0);
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true' || value === true || false),
    _ts_metadata("design:type", Boolean)
], MemoryCacheConfigDto.prototype, "useClones", void 0);
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>value === 'true' || value === true),
    _ts_metadata("design:type", Boolean)
], MemoryCacheConfigDto.prototype, "deleteOnExpire", void 0);
export class RedisConfigDto {
    constructor(){
        this.host = 'localhost';
        this.port = 6379;
        this.db = 0;
        this.ttl = 7200;
        this.maxRetries = 3;
        this.retryDelayOnFailover = 100;
    }
}
_ts_decorate([
    IsString(),
    Transform(({ value })=>value || 'localhost'),
    _ts_metadata("design:type", String)
], RedisConfigDto.prototype, "host", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Max(65535),
    Transform(({ value })=>Number.parseInt(value) || 6379),
    _ts_metadata("design:type", Number)
], RedisConfigDto.prototype, "port", void 0);
_ts_decorate([
    IsOptional(),
    IsString(),
    _ts_metadata("design:type", String)
], RedisConfigDto.prototype, "password", void 0);
_ts_decorate([
    IsNumber(),
    Min(0),
    Max(15),
    Transform(({ value })=>Number.parseInt(value) || 0),
    _ts_metadata("design:type", Number)
], RedisConfigDto.prototype, "db", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value) || 7200),
    _ts_metadata("design:type", Number)
], RedisConfigDto.prototype, "ttl", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value) || 3),
    _ts_metadata("design:type", Number)
], RedisConfigDto.prototype, "maxRetries", void 0);
_ts_decorate([
    IsNumber(),
    Min(100),
    Transform(({ value })=>Number.parseInt(value) || 100),
    _ts_metadata("design:type", Number)
], RedisConfigDto.prototype, "retryDelayOnFailover", void 0);
export class FileCacheConfigDto {
    constructor(){
        this.directory = './storage';
        this.maxSize = 1073741824;
        this.cleanupInterval = 3600;
    }
}
_ts_decorate([
    IsString(),
    Transform(({ value })=>value || './storage'),
    _ts_metadata("design:type", String)
], FileCacheConfigDto.prototype, "directory", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value) || 1073741824),
    _ts_metadata("design:type", Number)
], FileCacheConfigDto.prototype, "maxSize", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Transform(({ value })=>Number.parseInt(value) || 3600),
    _ts_metadata("design:type", Number)
], FileCacheConfigDto.prototype, "cleanupInterval", void 0);
export class CacheConfigDto {
    constructor(){
        this.memory = new MemoryCacheConfigDto();
        this.redis = new RedisConfigDto();
        this.file = new FileCacheConfigDto();
    }
}
_ts_decorate([
    ValidateNested(),
    Type(()=>MemoryCacheConfigDto),
    _ts_metadata("design:type", typeof MemoryCacheConfigDto === "undefined" ? Object : MemoryCacheConfigDto)
], CacheConfigDto.prototype, "memory", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>RedisConfigDto),
    _ts_metadata("design:type", typeof RedisConfigDto === "undefined" ? Object : RedisConfigDto)
], CacheConfigDto.prototype, "redis", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>FileCacheConfigDto),
    _ts_metadata("design:type", typeof FileCacheConfigDto === "undefined" ? Object : FileCacheConfigDto)
], CacheConfigDto.prototype, "file", void 0);

//# sourceMappingURL=cache-config.dto.js.map