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
exports.MetricsController = void 0;
const config_service_1 = require("../../Config/config.service");
const metrics_service_1 = require("../services/metrics.service");
const common_1 = require("@nestjs/common");
let MetricsController = class MetricsController {
    constructor(metricsService, configService) {
        this.metricsService = metricsService;
        this.configService = configService;
    }
    async getMetrics() {
        if (!this.configService.get('monitoring.enabled')) {
            return '# Metrics collection is disabled\n';
        }
        return this.metricsService.getMetrics();
    }
    async getMetricsJson() {
        if (!this.configService.get('monitoring.enabled')) {
            return { error: 'Metrics collection is disabled' };
        }
        const metricsText = await this.metricsService.getMetrics();
        return {
            timestamp: new Date().toISOString(),
            metrics: metricsText,
            registry: 'prometheus',
            format: 'text/plain',
        };
    }
};
exports.MetricsController = MetricsController;
__decorate([
    (0, common_1.Get)('metrics'),
    (0, common_1.Header)('Content-Type', 'text/plain; version=0.0.4; charset=utf-8'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MetricsController.prototype, "getMetrics", null);
__decorate([
    (0, common_1.Get)('metrics/json'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MetricsController.prototype, "getMetricsJson", null);
exports.MetricsController = MetricsController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [metrics_service_1.MetricsService,
        config_service_1.ConfigService])
], MetricsController);
//# sourceMappingURL=metrics.controller.js.map