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
exports.CacheConfigDto = exports.FileCacheConfigDto = exports.RedisConfigDto = exports.MemoryCacheConfigDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class MemoryCacheConfigDto {
    constructor() {
        this.maxSize = 104857600;
        this.ttl = 3600;
        this.checkPeriod = 600;
        this.useClones = false;
        this.deleteOnExpire = true;
    }
}
exports.MemoryCacheConfigDto = MemoryCacheConfigDto;
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 104857600),
    __metadata("design:type", Number)
], MemoryCacheConfigDto.prototype, "maxSize", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 3600),
    __metadata("design:type", Number)
], MemoryCacheConfigDto.prototype, "ttl", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 600),
    __metadata("design:type", Number)
], MemoryCacheConfigDto.prototype, "checkPeriod", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true || false),
    __metadata("design:type", Boolean)
], MemoryCacheConfigDto.prototype, "useClones", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true),
    __metadata("design:type", Boolean)
], MemoryCacheConfigDto.prototype, "deleteOnExpire", void 0);
class RedisConfigDto {
    constructor() {
        this.host = 'localhost';
        this.port = 6379;
        this.db = 0;
        this.ttl = 7200;
        this.maxRetries = 3;
        this.retryDelayOnFailover = 100;
    }
}
exports.RedisConfigDto = RedisConfigDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => value || 'localhost'),
    __metadata("design:type", String)
], RedisConfigDto.prototype, "host", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(65535),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 6379),
    __metadata("design:type", Number)
], RedisConfigDto.prototype, "port", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RedisConfigDto.prototype, "password", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(15),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 0),
    __metadata("design:type", Number)
], RedisConfigDto.prototype, "db", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 7200),
    __metadata("design:type", Number)
], RedisConfigDto.prototype, "ttl", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 3),
    __metadata("design:type", Number)
], RedisConfigDto.prototype, "maxRetries", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(100),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 100),
    __metadata("design:type", Number)
], RedisConfigDto.prototype, "retryDelayOnFailover", void 0);
class FileCacheConfigDto {
    constructor() {
        this.directory = './storage';
        this.maxSize = 1073741824;
        this.cleanupInterval = 3600;
    }
}
exports.FileCacheConfigDto = FileCacheConfigDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => value || './storage'),
    __metadata("design:type", String)
], FileCacheConfigDto.prototype, "directory", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 1073741824),
    __metadata("design:type", Number)
], FileCacheConfigDto.prototype, "maxSize", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 3600),
    __metadata("design:type", Number)
], FileCacheConfigDto.prototype, "cleanupInterval", void 0);
class CacheConfigDto {
    constructor() {
        this.memory = new MemoryCacheConfigDto();
        this.redis = new RedisConfigDto();
        this.file = new FileCacheConfigDto();
    }
}
exports.CacheConfigDto = CacheConfigDto;
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MemoryCacheConfigDto),
    __metadata("design:type", MemoryCacheConfigDto)
], CacheConfigDto.prototype, "memory", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => RedisConfigDto),
    __metadata("design:type", RedisConfigDto)
], CacheConfigDto.prototype, "redis", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => FileCacheConfigDto),
    __metadata("design:type", FileCacheConfigDto)
], CacheConfigDto.prototype, "file", void 0);
//# sourceMappingURL=cache-config.dto.js.map