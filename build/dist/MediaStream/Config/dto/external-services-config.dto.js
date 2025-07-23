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
exports.ExternalServicesConfigDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class ExternalServicesConfigDto {
    constructor() {
        this.djangoUrl = 'http://localhost:8000';
        this.nuxtUrl = 'http://localhost:3000';
        this.requestTimeout = 30000;
        this.maxRetries = 3;
    }
}
exports.ExternalServicesConfigDto = ExternalServicesConfigDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsUrl)({ require_tld: false }),
    (0, class_transformer_1.Transform)(({ value }) => value || 'http://localhost:8000'),
    __metadata("design:type", String)
], ExternalServicesConfigDto.prototype, "djangoUrl", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsUrl)({ require_tld: false }),
    (0, class_transformer_1.Transform)(({ value }) => value || 'http://localhost:3000'),
    __metadata("design:type", String)
], ExternalServicesConfigDto.prototype, "nuxtUrl", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1000),
    (0, class_validator_1.Max)(300000),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 30000),
    __metadata("design:type", Number)
], ExternalServicesConfigDto.prototype, "requestTimeout", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10),
    (0, class_transformer_1.Transform)(({ value }) => Number.parseInt(value) || 3),
    __metadata("design:type", Number)
], ExternalServicesConfigDto.prototype, "maxRetries", void 0);
//# sourceMappingURL=external-services-config.dto.js.map