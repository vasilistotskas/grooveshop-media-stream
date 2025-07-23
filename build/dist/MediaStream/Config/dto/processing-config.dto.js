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
exports.ProcessingConfigDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class ProcessingConfigDto {
    constructor() {
        this.maxConcurrent = 10;
        this.timeout = 30000;
        this.retries = 3;
        this.maxFileSize = 10485760;
        this.allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'];
    }
}
exports.ProcessingConfigDto = ProcessingConfigDto;
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 10),
    __metadata("design:type", Number)
], ProcessingConfigDto.prototype, "maxConcurrent", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1000),
    (0, class_validator_1.Max)(300000),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 30000),
    __metadata("design:type", Number)
], ProcessingConfigDto.prototype, "timeout", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 3),
    __metadata("design:type", Number)
], ProcessingConfigDto.prototype, "retries", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1024),
    (0, class_validator_1.Max)(52428800),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 10485760),
    __metadata("design:type", Number)
], ProcessingConfigDto.prototype, "maxFileSize", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (typeof value === 'string') {
            return value.split(',').map(format => format.trim().toLowerCase());
        }
        return value || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'];
    }),
    __metadata("design:type", Array)
], ProcessingConfigDto.prototype, "allowedFormats", void 0);
//# sourceMappingURL=processing-config.dto.js.map