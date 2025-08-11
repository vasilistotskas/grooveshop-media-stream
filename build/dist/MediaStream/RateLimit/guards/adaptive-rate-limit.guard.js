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
var AdaptiveRateLimitGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdaptiveRateLimitGuard = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const rate_limit_metrics_service_1 = require("../services/rate-limit-metrics.service");
const rate_limit_service_1 = require("../services/rate-limit.service");
let AdaptiveRateLimitGuard = AdaptiveRateLimitGuard_1 = class AdaptiveRateLimitGuard {
    constructor(rateLimitService, rateLimitMetricsService) {
        this.rateLimitService = rateLimitService;
        this.rateLimitMetricsService = rateLimitMetricsService;
        this._logger = new common_1.Logger(AdaptiveRateLimitGuard_1.name);
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        if (this.shouldSkipRateLimit(request)) {
            return true;
        }
        try {
            const clientIp = this.getClientIp(request);
            const requestType = this.getRequestType(request);
            const userAgent = request.headers['user-agent'] || '';
            const rateLimitKey = this.rateLimitService.generateAdvancedKey(clientIp, userAgent, requestType);
            const config = this.rateLimitService.getRateLimitConfig(requestType);
            const adaptiveLimit = await this.rateLimitService.calculateAdaptiveLimit(config.max);
            const adaptiveConfig = { ...config, max: adaptiveLimit };
            const { allowed, info } = await this.rateLimitService.checkRateLimit(rateLimitKey, adaptiveConfig);
            this.rateLimitService.recordRateLimitMetrics(requestType, allowed, info);
            this.rateLimitMetricsService.recordRateLimitAttempt(requestType, clientIp, allowed);
            this.addRateLimitHeaders(response, info);
            if (!allowed) {
                this._logger.warn(`Rate limit exceeded for ${clientIp} on ${requestType}`, {
                    clientIp,
                    requestType,
                    current: info.current,
                    limit: info.limit,
                    resetTime: info.resetTime,
                });
                throw new throttler_1.ThrottlerException('Rate limit exceeded');
            }
            this._logger.debug(`Rate limit check passed for ${clientIp} on ${requestType}`, {
                clientIp,
                requestType,
                current: info.current,
                limit: info.limit,
                remaining: info.remaining,
            });
            return true;
        }
        catch (error) {
            if (error instanceof throttler_1.ThrottlerException) {
                throw error;
            }
            this._logger.error('Error in rate limit guard:', error);
            return true;
        }
    }
    shouldSkipRateLimit(request) {
        const url = request.url || '';
        if (url.startsWith('/health')) {
            return true;
        }
        if (url.startsWith('/metrics')) {
            return true;
        }
        if (url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg)$/)) {
            return true;
        }
        return false;
    }
    getClientIp(request) {
        return (request.headers['x-forwarded-for']?.split(',')[0]
            || request.headers['x-real-ip']
            || request.connection?.remoteAddress
            || request.socket?.remoteAddress
            || request.ip
            || 'unknown');
    }
    getRequestType(request) {
        const url = request.url || '';
        const method = request.method || 'GET';
        if (url.includes('/media/uploads/') || url.includes('/static/images/') || url.includes('/image-processing')) {
            return 'image-processing';
        }
        if (url.startsWith('/health')) {
            return 'health-check';
        }
        return `${method.toLowerCase()}-default`;
    }
    addRateLimitHeaders(response, info) {
        response.setHeader('X-RateLimit-Limit', info.limit.toString());
        response.setHeader('X-RateLimit-Remaining', info.remaining.toString());
        response.setHeader('X-RateLimit-Reset', Math.ceil(info.resetTime.getTime() / 1000).toString());
        response.setHeader('X-RateLimit-Used', info.current.toString());
    }
};
exports.AdaptiveRateLimitGuard = AdaptiveRateLimitGuard;
exports.AdaptiveRateLimitGuard = AdaptiveRateLimitGuard = AdaptiveRateLimitGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rate_limit_service_1.RateLimitService,
        rate_limit_metrics_service_1.RateLimitMetricsService])
], AdaptiveRateLimitGuard);
//# sourceMappingURL=adaptive-rate-limit.guard.js.map