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
var RateLimitMetricsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitMetricsService = void 0;
const config_service_1 = require("../../Config/config.service");
const common_1 = require("@nestjs/common");
const promClient = __importStar(require("prom-client"));
let RateLimitMetricsService = RateLimitMetricsService_1 = class RateLimitMetricsService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RateLimitMetricsService_1.name);
        this.register = new promClient.Registry();
        this.rateLimitAttemptsTotal = new promClient.Counter({
            name: 'mediastream_rate_limit_attempts_total',
            help: 'Total number of rate limit attempts',
            labelNames: ['request_type', 'client_ip', 'status'],
            registers: [this.register],
        });
        this.rateLimitBlockedTotal = new promClient.Counter({
            name: 'mediastream_rate_limit_blocked_total',
            help: 'Total number of blocked requests due to rate limiting',
            labelNames: ['request_type', 'client_ip', 'reason'],
            registers: [this.register],
        });
        this.rateLimitCurrentRequests = new promClient.Gauge({
            name: 'mediastream_rate_limit_current_requests',
            help: 'Current number of requests in rate limit window',
            labelNames: ['request_type', 'client_ip'],
            registers: [this.register],
        });
        this.rateLimitAdaptiveAdjustments = new promClient.Counter({
            name: 'mediastream_rate_limit_adaptive_adjustments_total',
            help: 'Total number of adaptive rate limit adjustments',
            labelNames: ['adjustment_type', 'reason'],
            registers: [this.register],
        });
        this.rateLimitSystemLoad = new promClient.Gauge({
            name: 'mediastream_rate_limit_system_load',
            help: 'System load metrics used for adaptive rate limiting',
            labelNames: ['metric_type'],
            registers: [this.register],
        });
    }
    async onModuleInit() {
        if (this.configService.get('monitoring.enabled')) {
            this.logger.log('Rate limit metrics service initialized');
        }
    }
    recordRateLimitAttempt(requestType, clientIp, allowed) {
        const status = allowed ? 'allowed' : 'blocked';
        this.rateLimitAttemptsTotal.inc({
            request_type: requestType,
            client_ip: this.hashIp(clientIp),
            status,
        });
        if (!allowed) {
            this.rateLimitBlockedTotal.inc({
                request_type: requestType,
                client_ip: this.hashIp(clientIp),
                reason: 'rate_limit_exceeded',
            });
        }
    }
    updateCurrentRequests(requestType, clientIp, count) {
        this.rateLimitCurrentRequests.set({
            request_type: requestType,
            client_ip: this.hashIp(clientIp),
        }, count);
    }
    recordAdaptiveAdjustment(adjustmentType, reason) {
        this.rateLimitAdaptiveAdjustments.inc({
            adjustment_type: adjustmentType,
            reason,
        });
    }
    updateSystemLoadMetrics(cpuUsage, memoryUsage, activeConnections) {
        this.rateLimitSystemLoad.set({ metric_type: 'cpu_usage' }, cpuUsage);
        this.rateLimitSystemLoad.set({ metric_type: 'memory_usage' }, memoryUsage);
        this.rateLimitSystemLoad.set({ metric_type: 'active_connections' }, activeConnections);
    }
    async getRateLimitStats() {
        try {
            return {
                totalAttempts: 0,
                totalBlocked: 0,
                blockRate: 0,
                topBlockedIps: [],
                topRequestTypes: [],
            };
        }
        catch (error) {
            this.logger.error('Failed to get rate limit stats:', error);
            throw error;
        }
    }
    getCurrentRateLimitConfig() {
        return {
            defaultLimit: this.configService.getOptional('rateLimit.default.max', 100),
            imageProcessingLimit: this.configService.getOptional('rateLimit.imageProcessing.max', 50),
            healthCheckLimit: this.configService.getOptional('rateLimit.healthCheck.max', 1000),
            windowMs: this.configService.getOptional('rateLimit.default.windowMs', 60000),
        };
    }
    hashIp(ip) {
        let hash = 0;
        for (let i = 0; i < ip.length; i++) {
            const char = ip.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `ip_${Math.abs(hash).toString(36)}`;
    }
    resetMetrics() {
        this.rateLimitAttemptsTotal.reset();
        this.rateLimitBlockedTotal.reset();
        this.rateLimitCurrentRequests.reset();
        this.rateLimitAdaptiveAdjustments.reset();
        this.rateLimitSystemLoad.reset();
    }
};
exports.RateLimitMetricsService = RateLimitMetricsService;
exports.RateLimitMetricsService = RateLimitMetricsService = RateLimitMetricsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], RateLimitMetricsService);
//# sourceMappingURL=rate-limit-metrics.service.js.map