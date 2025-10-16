function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { Buffer } from "node:buffer";
import { Injectable, Logger } from "@nestjs/common";
import { MetricsService } from "../services/metrics.service.js";
export class MetricsMiddleware {
    use(req, res, next) {
        const startTime = Date.now();
        this.metricsService.incrementRequestsInFlight();
        const requestSize = this.getRequestSize(req);
        const originalEnd = res.end.bind(res);
        let responseSize = 0;
        res.end = function(chunk, encoding, cb) {
            if (chunk) {
                responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
            }
            return originalEnd(chunk, encoding, cb);
        };
        res.on('finish', ()=>{
            try {
                const duration = (Date.now() - startTime) / 1000;
                const route = this.getRoute(req);
                this.metricsService.recordHttpRequest(req.method, route, res.statusCode, duration, requestSize, responseSize);
                this.metricsService.decrementRequestsInFlight();
                this._logger.debug(`HTTP ${req.method} ${route} ${res.statusCode} - ${duration}s`);
            } catch (error) {
                this._logger.error('Failed to record HTTP metrics:', error);
                this.metricsService.recordError('metrics_middleware', 'http_tracking');
            }
        });
        res.on('error', (error)=>{
            this._logger.error('HTTP request error:', error);
            this.metricsService.recordError('http_request', 'response_error');
            this.metricsService.decrementRequestsInFlight();
        });
        next();
    }
    getRequestSize(req) {
        const contentLength = req.get('content-length');
        if (contentLength) {
            return Number.parseInt(contentLength, 10) || 0;
        }
        let size = 0;
        for (const [key, value] of Object.entries(req.headers)){
            size += key.length + (Array.isArray(value) ? value.join('').length : String(value).length);
        }
        size += req.url.length;
        return size;
    }
    getRoute(req) {
        if (req.route?.path) {
            return req.route.path;
        }
        const pathname = req.url.split('?')[0];
        return pathname.replace(/\/\d+/g, '/:id').replace(/\/[a-f0-9-]{36}/g, '/:uuid').replace(/\/[a-f0-9]{24}/g, '/:objectId');
    }
    constructor(metricsService){
        this.metricsService = metricsService;
        this._logger = new Logger(MetricsMiddleware.name);
    }
}
MetricsMiddleware = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof MetricsService === "undefined" ? Object : MetricsService
    ])
], MetricsMiddleware);

//# sourceMappingURL=metrics.middleware.js.map