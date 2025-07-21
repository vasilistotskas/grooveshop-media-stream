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
exports.CorrelationMiddleware = exports.CORRELATION_ID_HEADER = void 0;
const common_1 = require("@nestjs/common");
const correlation_service_1 = require("../services/correlation.service");
exports.CORRELATION_ID_HEADER = 'x-correlation-id';
let CorrelationMiddleware = class CorrelationMiddleware {
    constructor(correlationService) {
        this.correlationService = correlationService;
    }
    use(req, res, next) {
        const correlationId = req.headers[exports.CORRELATION_ID_HEADER] ||
            this.correlationService.generateCorrelationId();
        const context = {
            correlationId,
            timestamp: Date.now(),
            clientIp: this.getClientIp(req),
            userAgent: req.headers['user-agent'],
            method: req.method,
            url: req.url,
            startTime: process.hrtime.bigint(),
        };
        res.setHeader(exports.CORRELATION_ID_HEADER, correlationId);
        this.correlationService.runWithContext(context, () => {
            next();
        });
    }
    getClientIp(req) {
        return (req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.headers['x-real-ip'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            'unknown');
    }
};
exports.CorrelationMiddleware = CorrelationMiddleware;
exports.CorrelationMiddleware = CorrelationMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [correlation_service_1.CorrelationService])
], CorrelationMiddleware);
//# sourceMappingURL=correlation.middleware.js.map