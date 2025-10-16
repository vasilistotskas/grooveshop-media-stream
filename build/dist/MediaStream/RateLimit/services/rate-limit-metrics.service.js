function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { ConfigService } from "../../Config/config.service.js";
import { Injectable, Logger } from "@nestjs/common";
import * as promClient from "prom-client";
export class RateLimitMetricsService {
    async onModuleInit() {
        if (this._configService.get('monitoring.enabled')) {
            this._logger.log('Rate limit metrics service initialized');
        }
    }
    /**
	 * Record a rate limit attempt
	 */ recordRateLimitAttempt(requestType, clientIp, allowed) {
        const status = allowed ? 'allowed' : 'blocked';
        this.rateLimitAttemptsTotal.inc({
            request_type: requestType,
            client_ip: this.hashIp(clientIp),
            status
        });
        if (!allowed) {
            this.rateLimitBlockedTotal.inc({
                request_type: requestType,
                client_ip: this.hashIp(clientIp),
                reason: 'rate_limit_exceeded'
            });
        }
    }
    /**
	 * Update current request count for a client
	 */ updateCurrentRequests(requestType, clientIp, count) {
        this.rateLimitCurrentRequests.set({
            request_type: requestType,
            client_ip: this.hashIp(clientIp)
        }, count);
    }
    /**
	 * Record adaptive rate limit adjustment
	 */ recordAdaptiveAdjustment(adjustmentType, reason) {
        this.rateLimitAdaptiveAdjustments.inc({
            adjustment_type: adjustmentType,
            reason
        });
    }
    /**
	 * Update system load metrics
	 */ updateSystemLoadMetrics(cpuUsage, memoryUsage, activeConnections) {
        this.rateLimitSystemLoad.set({
            metric_type: 'cpu_usage'
        }, cpuUsage);
        this.rateLimitSystemLoad.set({
            metric_type: 'memory_usage'
        }, memoryUsage);
        this.rateLimitSystemLoad.set({
            metric_type: 'active_connections'
        }, activeConnections);
    }
    /**
	 * Get rate limiting statistics
	 */ async getRateLimitStats() {
        try {
            // In a real implementation, this would query the metrics registry
            // For now, we'll return placeholder data
            return {
                totalAttempts: 0,
                totalBlocked: 0,
                blockRate: 0,
                topBlockedIps: [],
                topRequestTypes: []
            };
        } catch (error) {
            this._logger.error('Failed to get rate limit stats:', error);
            throw error;
        }
    }
    /**
	 * Get current rate limit configuration
	 */ getCurrentRateLimitConfig() {
        return {
            defaultLimit: this._configService.getOptional('rateLimit.default.max', 100),
            imageProcessingLimit: this._configService.getOptional('rateLimit.imageProcessing.max', 50),
            healthCheckLimit: this._configService.getOptional('rateLimit.healthCheck.max', 1000),
            windowMs: this._configService.getOptional('rateLimit.default.windowMs', 60000)
        };
    }
    /**
	 * Hash IP address for privacy in metrics
	 */ hashIp(ip) {
        let hash = 0;
        for(let i = 0; i < ip.length; i++){
            const char = ip.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return `ip_${Math.abs(hash).toString(36)}`;
    }
    /**
	 * Reset metrics (useful for testing)
	 */ resetMetrics() {
        this.rateLimitAttemptsTotal.reset();
        this.rateLimitBlockedTotal.reset();
        this.rateLimitCurrentRequests.reset();
        this.rateLimitAdaptiveAdjustments.reset();
        this.rateLimitSystemLoad.reset();
    }
    constructor(_configService){
        this._configService = _configService;
        this._logger = new Logger(RateLimitMetricsService.name);
        this.register = new promClient.Registry();
        this.rateLimitAttemptsTotal = new promClient.Counter({
            name: 'mediastream_rate_limit_attempts_total',
            help: 'Total number of rate limit attempts',
            labelNames: [
                'request_type',
                'client_ip',
                'status'
            ],
            registers: [
                this.register
            ]
        });
        this.rateLimitBlockedTotal = new promClient.Counter({
            name: 'mediastream_rate_limit_blocked_total',
            help: 'Total number of blocked requests due to rate limiting',
            labelNames: [
                'request_type',
                'client_ip',
                'reason'
            ],
            registers: [
                this.register
            ]
        });
        this.rateLimitCurrentRequests = new promClient.Gauge({
            name: 'mediastream_rate_limit_current_requests',
            help: 'Current number of requests in rate limit window',
            labelNames: [
                'request_type',
                'client_ip'
            ],
            registers: [
                this.register
            ]
        });
        this.rateLimitAdaptiveAdjustments = new promClient.Counter({
            name: 'mediastream_rate_limit_adaptive_adjustments_total',
            help: 'Total number of adaptive rate limit adjustments',
            labelNames: [
                'adjustment_type',
                'reason'
            ],
            registers: [
                this.register
            ]
        });
        this.rateLimitSystemLoad = new promClient.Gauge({
            name: 'mediastream_rate_limit_system_load',
            help: 'System load metrics used for adaptive rate limiting',
            labelNames: [
                'metric_type'
            ],
            registers: [
                this.register
            ]
        });
    }
}
RateLimitMetricsService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ConfigService === "undefined" ? Object : ConfigService
    ])
], RateLimitMetricsService);

//# sourceMappingURL=rate-limit-metrics.service.js.map