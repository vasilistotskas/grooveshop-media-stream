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
exports.AppConfigDto = void 0;
const cache_config_dto_1 = require("./cache-config.dto");
const http_config_dto_1 = require("./http-config.dto");
const monitoring_config_dto_1 = require("./monitoring-config.dto");
const processing_config_dto_1 = require("./processing-config.dto");
const server_config_dto_1 = require("./server-config.dto");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const external_services_config_dto_1 = require("./external-services-config.dto");
class AppConfigDto {
    constructor() {
        this.server = new server_config_dto_1.ServerConfigDto();
        this.cache = new cache_config_dto_1.CacheConfigDto();
        this.processing = new processing_config_dto_1.ProcessingConfigDto();
        this.monitoring = new monitoring_config_dto_1.MonitoringConfigDto();
        this.externalServices = new external_services_config_dto_1.ExternalServicesConfigDto();
        this.http = new http_config_dto_1.HttpConfigDto();
    }
}
exports.AppConfigDto = AppConfigDto;
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => server_config_dto_1.ServerConfigDto),
    __metadata("design:type", server_config_dto_1.ServerConfigDto)
], AppConfigDto.prototype, "server", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => cache_config_dto_1.CacheConfigDto),
    __metadata("design:type", cache_config_dto_1.CacheConfigDto)
], AppConfigDto.prototype, "cache", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => processing_config_dto_1.ProcessingConfigDto),
    __metadata("design:type", processing_config_dto_1.ProcessingConfigDto)
], AppConfigDto.prototype, "processing", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => monitoring_config_dto_1.MonitoringConfigDto),
    __metadata("design:type", monitoring_config_dto_1.MonitoringConfigDto)
], AppConfigDto.prototype, "monitoring", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => external_services_config_dto_1.ExternalServicesConfigDto),
    __metadata("design:type", external_services_config_dto_1.ExternalServicesConfigDto)
], AppConfigDto.prototype, "externalServices", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => http_config_dto_1.HttpConfigDto),
    __metadata("design:type", http_config_dto_1.HttpConfigDto)
], AppConfigDto.prototype, "http", void 0);
//# sourceMappingURL=app-config.dto.js.map