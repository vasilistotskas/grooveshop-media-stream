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
var RateLimitService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitService = void 0;
const process = __importStar(require("node:process"));
const config_service_1 = require("../../Config/config.service");
const metrics_service_1 = require("../../Metrics/services/metrics.service");
const common_1 = require("@nestjs/common");
let RateLimitService = RateLimitService_1 = class RateLimitService {
    constructor(_configService, metricsService) {
        this._configService = _configService;
        this.metricsService = metricsService;
        this._logger = new common_1.Logger(RateLimitService_1.name);
        this.requestCounts = new Map();
        this.systemLoadThresholds = {
            cpu: 80,
            memory: 85,
            connections: 1000,
        };
    }
    generateKey(ip, requestType) {
        return `${ip}:${requestType}`;
    }
    generateAdvancedKey(ip, userAgent, requestType) {
        const userAgentHash = this.simpleHash(userAgent || 'unknown');
        return `${ip}:${userAgentHash}:${requestType}`;
    }
    getRateLimitConfig(requestType) {
        const baseConfig = {
            windowMs: this._configService.getOptional('rateLimit.default.windowMs', 60000),
            max: this._configService.getOptional('rateLimit.default.max', 100),
            skipSuccessfulRequests: false,
            skipFailedRequests: false,
        };
        switch (requestType) {
            case 'image-processing':
                return {
                    ...baseConfig,
                    windowMs: this._configService.getOptional('rateLimit.imageProcessing.windowMs', 60000),
                    max: this._configService.getOptional('rateLimit.imageProcessing.max', 50),
                };
            case 'health-check':
                return {
                    ...baseConfig,
                    windowMs: this._configService.getOptional('rateLimit.healthCheck.windowMs', 10000),
                    max: this._configService.getOptional('rateLimit.healthCheck.max', 1000),
                };
            default:
                return baseConfig;
        }
    }
    async checkRateLimit(key, config) {
        const now = Date.now();
        const windowStart = now - config.windowMs;
        this.cleanupOldEntries(windowStart);
        let entry = this.requestCounts.get(key);
        const resetTime = new Date(now + config.windowMs);
        if (!entry || entry.resetTime <= now) {
            entry = { count: 1, resetTime: now + config.windowMs };
            this.requestCounts.set(key, entry);
            return {
                allowed: true,
                info: {
                    limit: config.max,
                    current: 1,
                    remaining: config.max - 1,
                    resetTime,
                },
            };
        }
        entry.count += 1;
        const currentCount = entry.count;
        const allowed = currentCount <= config.max;
        return {
            allowed,
            info: {
                limit: config.max,
                current: currentCount,
                remaining: Math.max(0, config.max - currentCount),
                resetTime: new Date(entry.resetTime),
            },
        };
    }
    async getSystemLoad() {
        const memoryUsage = process.memoryUsage();
        const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
        const cpuUsage = 0;
        return {
            cpuUsage,
            memoryUsage: memoryUsagePercent,
            activeConnections: 0,
        };
    }
    async calculateAdaptiveLimit(baseLimit) {
        if (process.env.NODE_ENV === 'test') {
            return baseLimit;
        }
        const systemLoad = await this.getSystemLoad();
        let adaptiveLimit = baseLimit;
        if (systemLoad.memoryUsage > this.systemLoadThresholds.memory) {
            const reductionFactor = Math.min(0.5, (systemLoad.memoryUsage - this.systemLoadThresholds.memory) / 20);
            adaptiveLimit = Math.floor(adaptiveLimit * (1 - reductionFactor));
        }
        if (systemLoad.cpuUsage > this.systemLoadThresholds.cpu) {
            const reductionFactor = Math.min(0.5, (systemLoad.cpuUsage - this.systemLoadThresholds.cpu) / 20);
            adaptiveLimit = Math.floor(adaptiveLimit * (1 - reductionFactor));
        }
        return Math.max(1, adaptiveLimit);
    }
    recordRateLimitMetrics(requestType, allowed, info) {
        if (!allowed) {
            this.metricsService.recordError('rate_limit_exceeded', requestType);
        }
        try {
            this.metricsService.getRegistry();
            this._logger.debug('Rate limit metrics recorded', {
                requestType,
                allowed,
                current: info.current,
                limit: info.limit,
                remaining: info.remaining,
            });
        }
        catch (error) {
            this._logger.error('Failed to record rate limit metrics:', error);
        }
    }
    cleanupOldEntries(windowStart) {
        for (const [key, entry] of this.requestCounts.entries()) {
            if (entry.resetTime <= windowStart) {
                this.requestCounts.delete(key);
            }
        }
    }
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
    resetRateLimit(key) {
        this.requestCounts.delete(key);
    }
    clearAllRateLimits() {
        const entriesCount = this.requestCounts.size;
        this.requestCounts.clear();
        if (process.env.NODE_ENV === 'test' && entriesCount > 0) {
            this._logger.debug(`Cleared ${entriesCount} rate limit entries`);
        }
    }
    getRateLimitStatus(key) {
        const entry = this.requestCounts.get(key);
        if (!entry) {
            return null;
        }
        return {
            limit: 0,
            current: entry.count,
            remaining: 0,
            resetTime: new Date(entry.resetTime),
        };
    }
    getDebugInfo() {
        const entries = Array.from(this.requestCounts.entries()).map(([key, entry]) => ({
            key,
            count: entry.count,
            resetTime: entry.resetTime,
        }));
        return {
            totalEntries: this.requestCounts.size,
            entries,
        };
    }
};
exports.RateLimitService = RateLimitService;
exports.RateLimitService = RateLimitService = RateLimitService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService,
        metrics_service_1.MetricsService])
], RateLimitService);
//# sourceMappingURL=rate-limit.service.js.map