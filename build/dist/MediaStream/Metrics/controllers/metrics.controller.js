function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { Controller, Get, Header, HttpCode, HttpStatus } from "@nestjs/common";
import { MetricsService } from "../services/metrics.service.js";
export class MetricsController {
    /**
	 * Prometheus metrics endpoint
	 * Returns metrics in Prometheus format for scraping
	 */ async getMetrics() {
        return await this.metricsService.getMetrics();
    }
    /**
	 * Health check for metrics endpoint
	 */ getMetricsHealth() {
        return {
            status: 'healthy',
            timestamp: Date.now(),
            service: 'metrics',
            registry: {
                metricsCount: this.metricsService.getRegistry().getMetricsAsArray().length
            }
        };
    }
    constructor(metricsService){
        this.metricsService = metricsService;
    }
}
_ts_decorate([
    Get(),
    HttpCode(HttpStatus.OK),
    Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], MetricsController.prototype, "getMetrics", null);
_ts_decorate([
    Get('health'),
    HttpCode(HttpStatus.OK),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Object)
], MetricsController.prototype, "getMetricsHealth", null);
MetricsController = _ts_decorate([
    Controller('metrics'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof MetricsService === "undefined" ? Object : MetricsService
    ])
], MetricsController);

//# sourceMappingURL=metrics.controller.js.map