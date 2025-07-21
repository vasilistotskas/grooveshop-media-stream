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
var TimingMiddleware_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimingMiddleware = void 0;
const common_1 = require("@nestjs/common");
const correlation_service_1 = require("../services/correlation.service");
const logger_util_1 = require("../utils/logger.util");
const performance_tracker_util_1 = require("../utils/performance-tracker.util");
let TimingMiddleware = TimingMiddleware_1 = class TimingMiddleware {
    constructor(correlationService) {
        this.correlationService = correlationService;
    }
    use(req, res, next) {
        const startTime = process.hrtime.bigint();
        const startTimestamp = Date.now();
        res.on('finish', () => {
            const endTime = process.hrtime.bigint();
            const endTimestamp = Date.now();
            const duration = Number(endTime - startTime) / 1_000_000;
            res.setHeader('x-response-time', `${duration.toFixed(2)}ms`);
            res.setHeader('x-request-start', startTimestamp.toString());
            res.setHeader('x-request-end', endTimestamp.toString());
            this.correlationService.updateContext({
                startTime: startTime,
                endTime: endTime,
                duration: duration,
                startTimestamp: startTimestamp,
                endTimestamp: endTimestamp
            });
            const context = this.correlationService.getContext();
            if (context) {
                const logLevel = this.getLogLevel(duration, res.statusCode);
                const message = `${req.method} ${req.url} - ${res.statusCode} - ${duration.toFixed(2)}ms`;
                if (logLevel === 'warn') {
                    logger_util_1.CorrelatedLogger.warn(`SLOW REQUEST: ${message}`, TimingMiddleware_1.name);
                }
                else if (logLevel === 'error') {
                    logger_util_1.CorrelatedLogger.error(`FAILED REQUEST: ${message}`, '', TimingMiddleware_1.name);
                }
                else {
                    logger_util_1.CorrelatedLogger.debug(message, TimingMiddleware_1.name);
                }
                if (duration > 1000) {
                    logger_util_1.CorrelatedLogger.warn(`Performance Alert: Request took ${duration.toFixed(2)}ms - consider optimization`, TimingMiddleware_1.name);
                }
                performance_tracker_util_1.PerformanceTracker.logSummary();
            }
        });
        next();
    }
    getLogLevel(duration, statusCode) {
        if (statusCode >= 500) {
            return 'error';
        }
        if (statusCode >= 400 || duration > 2000) {
            return 'warn';
        }
        return 'debug';
    }
};
exports.TimingMiddleware = TimingMiddleware;
exports.TimingMiddleware = TimingMiddleware = TimingMiddleware_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [correlation_service_1.CorrelationService])
], TimingMiddleware);
//# sourceMappingURL=timing.middleware.js.map