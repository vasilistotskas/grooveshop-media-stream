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
import { ConfigService } from "../../Config/config.service.js";
import { MetricsService } from "../../Metrics/services/metrics.service.js";
import { Injectable, Logger } from "@nestjs/common";
export class RateLimitService {
    constructor(_configService, metricsService){
        this._configService = _configService;
        this.metricsService = metricsService;
        this._logger = new Logger(RateLimitService.name);
        this.requestCounts = new Map();
        this.systemLoadThresholds = {
            cpu: 80,
            memory: 85,
            connections: 1000
        };
    }
    /**
	 * Generate rate limit key based on IP and request type
	 */ generateKey(ip, requestType) {
        return `${ip}:${requestType}`;
    }
    /**
	 * Generate key based on IP and user agent for more granular control
	 */ generateAdvancedKey(ip, userAgent, requestType) {
        const userAgentHash = this.simpleHash(userAgent || 'unknown');
        return `${ip}:${userAgentHash}:${requestType}`;
    }
    /**
	 * Get rate limit configuration for specific request type
	 */ getRateLimitConfig(requestType) {
        const baseConfig = {
            windowMs: this._configService.getOptional('rateLimit.default.windowMs', 60000),
            max: this._configService.getOptional('rateLimit.default.max', 500),
            skipSuccessfulRequests: false,
            skipFailedRequests: false
        };
        switch(requestType){
            case 'image-processing':
                return {
                    ...baseConfig,
                    windowMs: this._configService.getOptional('rateLimit.imageProcessing.windowMs', 60000),
                    max: this._configService.getOptional('rateLimit.imageProcessing.max', 300)
                };
            case 'health-check':
                return {
                    ...baseConfig,
                    windowMs: this._configService.getOptional('rateLimit.healthCheck.windowMs', 10000),
                    max: this._configService.getOptional('rateLimit.healthCheck.max', 1000)
                };
            default:
                return baseConfig;
        }
    }
    /**
	 * Check if user agent is a known bot/crawler
	 */ isBot(userAgent) {
        if (!userAgent) {
            return false;
        }
        const botPatterns = [
            // Social Media Crawlers
            /facebook/i,
            /facebookexternalhit/i,
            /facebookcatalog/i,
            /Facebot/i,
            /Twitterbot/i,
            /LinkedInBot/i,
            /WhatsApp/i,
            /TelegramBot/i,
            /Slackbot/i,
            /DiscordBot/i,
            /Discordbot/i,
            /Slack-ImgProxy/i,
            // Search Engine Crawlers
            /Googlebot/i,
            /bingbot/i,
            /Baiduspider/i,
            /YandexBot/i,
            /DuckDuckBot/i,
            /Slurp/i,
            /Applebot/i,
            // SEO & Analytics Tools
            /AhrefsBot/i,
            /SemrushBot/i,
            /MJ12bot/i,
            /DotBot/i,
            /Screaming Frog/i,
            /SEOkicks/i,
            // Other Common Bots
            /PingdomBot/i,
            /UptimeRobot/i,
            /StatusCake/i,
            /Lighthouse/i,
            /PageSpeed/i,
            /GTmetrix/i,
            /HeadlessChrome/i,
            /PhantomJS/i,
            /Prerender/i
        ];
        return botPatterns.some((pattern)=>pattern.test(userAgent));
    }
    /**
	 * Check if request should be rate limited
	 */ async checkRateLimit(key, config) {
        const now = Date.now();
        const windowStart = now - config.windowMs;
        this.cleanupOldEntries(windowStart);
        let entry = this.requestCounts.get(key);
        const resetTime = new Date(now + config.windowMs);
        if (!entry || entry.resetTime <= now) {
            entry = {
                count: 1,
                resetTime: now + config.windowMs
            };
            this.requestCounts.set(key, entry);
            return {
                allowed: true,
                info: {
                    limit: config.max,
                    current: 1,
                    remaining: config.max - 1,
                    resetTime
                }
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
                resetTime: new Date(entry.resetTime)
            }
        };
    }
    /**
	 * Get current system load for adaptive rate limiting
	 */ async getSystemLoad() {
        const memoryUsage = process.memoryUsage();
        const memoryUsagePercent = memoryUsage.heapUsed / memoryUsage.heapTotal * 100;
        // Note: CPU usage would require additional monitoring in a real implementation
        // For now, we'll use a placeholder
        const cpuUsage = 0 // This would be implemented with actual CPU monitoring
        ;
        return {
            cpuUsage,
            memoryUsage: memoryUsagePercent,
            activeConnections: 0
        };
    }
    /**
	 * Calculate adaptive rate limit based on system load
	 */ async calculateAdaptiveLimit(baseLimit) {
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
    /**
	 * Record rate limit metrics
	 */ recordRateLimitMetrics(requestType, allowed, info) {
        if (!allowed) {
            this.metricsService.recordError('rate_limit_exceeded', requestType);
        }
        try {
            this.metricsService.getRegistry();
            // This would be implemented with custom Prometheus metrics
            this._logger.debug('Rate limit metrics recorded', {
                requestType,
                allowed,
                current: info.current,
                limit: info.limit,
                remaining: info.remaining
            });
        } catch (error) {
            this._logger.error('Failed to record rate limit metrics:', error);
        }
    }
    /**
	 * Clean up old rate limit entries
	 */ cleanupOldEntries(windowStart) {
        for (const [key, entry] of this.requestCounts.entries()){
            if (entry.resetTime <= windowStart) {
                this.requestCounts.delete(key);
            }
        }
    }
    /**
	 * Simple hash function for user agent
	 */ simpleHash(str) {
        let hash = 0;
        for(let i = 0; i < str.length; i++){
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
    /**
	 * Reset rate limit for a specific key (useful for testing)
	 */ resetRateLimit(key) {
        this.requestCounts.delete(key);
    }
    /**
	 * Clear all rate limits (useful for testing)
	 */ clearAllRateLimits() {
        const entriesCount = this.requestCounts.size;
        this.requestCounts.clear();
        if (process.env.NODE_ENV === 'test' && entriesCount > 0) {
            this._logger.debug(`Cleared ${entriesCount} rate limit entries`);
        }
    }
    /**
	 * Get current rate limit status for a key
	 */ getRateLimitStatus(key) {
        const entry = this.requestCounts.get(key);
        if (!entry) {
            return null;
        }
        return {
            limit: 0,
            current: entry.count,
            remaining: 0,
            resetTime: new Date(entry.resetTime)
        };
    }
    /**
	 * Get whitelisted domains from configuration
	 */ getWhitelistedDomains() {
        const domainsString = this._configService.getOptional('rateLimit.bypass.whitelistedDomains', '');
        if (!domainsString || typeof domainsString !== 'string') {
            return [];
        }
        return domainsString.split(',').map((domain)=>domain.trim()).filter((domain)=>domain.length > 0);
    }
    /**
	 * Get bot bypass configuration
	 */ getBypassBotsConfig() {
        return this._configService.getOptional('rateLimit.bypass.bots', true);
    }
    /**
	 * Get debug information about current rate limit state (for testing)
	 */ getDebugInfo() {
        const entries = Array.from(this.requestCounts.entries()).map(([key, entry])=>({
                key,
                count: entry.count,
                resetTime: entry.resetTime
            }));
        return {
            totalEntries: this.requestCounts.size,
            entries
        };
    }
}
RateLimitService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ConfigService === "undefined" ? Object : ConfigService,
        typeof MetricsService === "undefined" ? Object : MetricsService
    ])
], RateLimitService);

//# sourceMappingURL=rate-limit.service.js.map