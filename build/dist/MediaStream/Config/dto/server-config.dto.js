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
exports.ServerConfigDto = exports.CorsConfigDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class CorsConfigDto {
    constructor() {
        this.origin = '*';
        this.methods = 'GET';
        this.maxAge = 86400;
    }
}
exports.CorsConfigDto = CorsConfigDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => value || '*'),
    __metadata("design:type", String)
], CorsConfigDto.prototype, "origin", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => value || 'GET'),
    __metadata("design:type", String)
], CorsConfigDto.prototype, "methods", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(86400),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 86400),
    __metadata("design:type", Number)
], CorsConfigDto.prototype, "maxAge", void 0);
class ServerConfigDto {
    constructor() {
        this.port = 3003;
        this.host = '0.0.0.0';
        this.cors = new CorsConfigDto();
    }
}
exports.ServerConfigDto = ServerConfigDto;
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(65535),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 3003),
    __metadata("design:type", Number)
], ServerConfigDto.prototype, "port", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => value || '0.0.0.0'),
    __metadata("design:type", String)
], ServerConfigDto.prototype, "host", void 0);
__decorate([
    (0, class_transformer_1.Type)(() => CorsConfigDto),
    __metadata("design:type", CorsConfigDto)
], ServerConfigDto.prototype, "cors", void 0);
//# sourceMappingURL=server-config.dto.js.map