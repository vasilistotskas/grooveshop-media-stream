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
import { CorrelatedLogger } from "../utils/logger.util.js";
import { PerformanceTracker } from "../utils/performance-tracker.util.js";
export class TimingMiddleware {
    constructor(_correlationService){
        this._correlationService = _correlationService;
    }
    use(req, res, next) {
        const startTime = process.hrtime.bigint();
        const startTimestamp = Date.now();
        res.setHeader('x-request-start', startTimestamp.toString());
        const originalEnd = res.end.bind(res);
        const correlationService = this._correlationService;
        res.end = function(chunk, encoding, cb) {
            const endTime = process.hrtime.bigint();
            const endTimestamp = Date.now();
            const duration = Number(endTime - startTime) / 1_000_000;
            if (!res.headersSent) {
                res.setHeader('x-response-time', `${duration.toFixed(2)}ms`);
                res.setHeader('x-request-end', endTimestamp.toString());
            }
            correlationService.updateContext({
                startTime,
                endTime,
                duration,
                startTimestamp,
                endTimestamp
            });
            const context = correlationService.getContext();
            if (context) {
                const logLevel = TimingMiddleware.prototype.getLogLevel(duration, res.statusCode);
                const message = `${req.method} ${req.url} - ${res.statusCode} - ${duration.toFixed(2)}ms`;
                if (logLevel === 'warn') {
                    CorrelatedLogger.warn(`SLOW REQUEST: ${message}`, TimingMiddleware.name);
                } else if (logLevel === 'error') {
                    CorrelatedLogger.error(`FAILED REQUEST: ${message}`, '', TimingMiddleware.name);
                } else {
                    CorrelatedLogger.debug(message, TimingMiddleware.name);
                }
                if (duration > 1000) {
                    CorrelatedLogger.warn(`Performance Alert: Request took ${duration.toFixed(2)}ms - consider optimization`, TimingMiddleware.name);
                }
                PerformanceTracker.logSummary();
            }
            return originalEnd(chunk, encoding, cb);
        };
        next();
    }
    /**
	 * Determine appropriate log level based on response time and status code
	 */ getLogLevel(duration, statusCode) {
        if (statusCode >= 500) {
            return 'error';
        }
        if (statusCode >= 400 || duration > 2000) {
            return 'warn';
        }
        return 'debug';
    }
}
TimingMiddleware = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof CorrelationService === "undefined" ? Object : CorrelationService
    ])
], TimingMiddleware);

//# sourceMappingURL=timing.middleware.js.map