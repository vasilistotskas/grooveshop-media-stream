function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import * as process from "node:process";
import { Injectable } from "@nestjs/common";
import { CorrelationService } from "../services/correlation.service.js";
export const CORRELATION_ID_HEADER = 'x-correlation-id';
export class CorrelationMiddleware {
    constructor(_correlationService){
        this._correlationService = _correlationService;
    }
    use(req, res, next) {
        const correlationId = req.headers[CORRELATION_ID_HEADER] || this._correlationService.generateCorrelationId();
        const context = {
            correlationId,
            timestamp: Date.now(),
            clientIp: this.getClientIp(req),
            userAgent: req.headers['user-agent'],
            method: req.method,
            url: req.url,
            startTime: process.hrtime.bigint()
        };
        res.setHeader(CORRELATION_ID_HEADER, correlationId);
        this._correlationService.runWithContext(context, ()=>{
            next();
        });
    }
    getClientIp(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
    }
}
CorrelationMiddleware = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof CorrelationService === "undefined" ? Object : CorrelationService
    ])
], CorrelationMiddleware);

//# sourceMappingURL=correlation.middleware.js.map