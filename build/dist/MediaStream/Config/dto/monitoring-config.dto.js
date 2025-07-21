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
exports.MonitoringConfigDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class MonitoringConfigDto {
    constructor() {
        this.enabled = true;
        this.metricsPort = 9090;
        this.healthPath = '/health';
        this.metricsPath = '/metrics';
    }
}
exports.MonitoringConfigDto = MonitoringConfigDto;
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
        }
        return value !== undefined ? value : true;
    }),
    __metadata("design:type", Boolean)
], MonitoringConfigDto.prototype, "enabled", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(65535),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value) || 9090),
    __metadata("design:type", Number)
], MonitoringConfigDto.prototype, "metricsPort", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => value || '/health'),
    __metadata("design:type", String)
], MonitoringConfigDto.prototype, "healthPath", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => value || '/metrics'),
    __metadata("design:type", String)
], MonitoringConfigDto.prototype, "metricsPath", void 0);
//# sourceMappingURL=monitoring-config.dto.js.map