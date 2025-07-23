"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var TimingMiddleware_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimingMiddleware = void 0;
const process = __importStar(require("node:process"));
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
                startTime,
                endTime,
                duration,
                startTimestamp,
                endTimestamp,
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