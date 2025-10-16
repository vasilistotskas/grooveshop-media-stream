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
import { Injectable, Logger } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { RateLimitMetricsService } from "../services/rate-limit-metrics.service.js";
import { RateLimitService } from "../services/rate-limit.service.js";
export class AdaptiveRateLimitGuard {
    constructor(rateLimitService, rateLimitMetricsService){
        this.rateLimitService = rateLimitService;
        this.rateLimitMetricsService = rateLimitMetricsService;
        this._logger = new Logger(AdaptiveRateLimitGuard.name);
    }
    async canActivate(context) {
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev') {
            this._logger.debug('Skipping rate limiting in development mode');
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        if (this.shouldSkipRateLimit(request)) {
            return true;
        }
        const userAgent = request.headers['user-agent'] || '';
        if (this.shouldBypassBot(userAgent)) {
            this._logger.debug('Skipping rate limiting for bot', {
                userAgent
            });
            return true;
        }
        try {
            const clientIp = this.getClientIp(request);
            const requestType = this.getRequestType(request);
            const userAgent = request.headers['user-agent'] || '';
            const rateLimitKey = this.rateLimitService.generateAdvancedKey(clientIp, userAgent, requestType);
            const config = this.rateLimitService.getRateLimitConfig(requestType);
            const adaptiveLimit = await this.rateLimitService.calculateAdaptiveLimit(config.max);
            const adaptiveConfig = {
                ...config,
                max: adaptiveLimit
            };
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
                    resetTime: info.resetTime
                });
                throw new ThrottlerException('Rate limit exceeded');
            }
            this._logger.debug(`Rate limit check passed for ${clientIp} on ${requestType}`, {
                clientIp,
                requestType,
                current: info.current,
                limit: info.limit,
                remaining: info.remaining
            });
            return true;
        } catch (error) {
            if (error instanceof ThrottlerException) {
                throw error;
            }
            this._logger.error('Error in rate limit guard:', error);
            return true;
        }
    }
    /**
	 * Determine if rate limiting should be skipped for this request
	 */ shouldSkipRateLimit(request) {
        const url = request.url || '';
        if (this.isDomainWhitelisted(request)) {
            this._logger.debug('Skipping rate limiting for whitelisted domain', {
                referer: request.headers.referer,
                origin: request.headers.origin
            });
            return true;
        }
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
    /**
	 * Check if bot bypass is enabled and user agent is a bot
	 */ shouldBypassBot(userAgent) {
        const bypassBots = this.rateLimitService.getBypassBotsConfig();
        if (!bypassBots) {
            return false;
        }
        return this.rateLimitService.isBot(userAgent);
    }
    /**
	 * Check if the request comes from a whitelisted domain
	 */ isDomainWhitelisted(request) {
        try {
            const whitelistedDomains = this.rateLimitService.getWhitelistedDomains();
            if (!whitelistedDomains || whitelistedDomains.length === 0) {
                return false;
            }
            const referer = request.headers.referer;
            if (referer) {
                try {
                    const refererUrl = new URL(referer);
                    const refererDomain = refererUrl.hostname;
                    if (this.matchesDomain(refererDomain, whitelistedDomains)) {
                        return true;
                    }
                } catch  {
                // Invalid referer URL, continue checking other headers
                }
            }
            const origin = request.headers.origin;
            if (origin) {
                try {
                    const originUrl = new URL(origin);
                    const originDomain = originUrl.hostname;
                    if (this.matchesDomain(originDomain, whitelistedDomains)) {
                        return true;
                    }
                } catch  {
                // Invalid origin URL, continue
                }
            }
            const host = request.headers.host;
            if (host) {
                const hostDomain = host.split(':')[0];
                if (this.matchesDomain(hostDomain, whitelistedDomains)) {
                    return true;
                }
            }
            return false;
        } catch (error) {
            this._logger.error('Error checking domain whitelist:', error);
            return false;
        }
    }
    /**
	 * Check if a domain matches any of the whitelisted domains
	 * Supports exact matches and wildcard subdomains (*.example.com)
	 */ matchesDomain(domain, whitelistedDomains) {
        for (const whitelistedDomain of whitelistedDomains){
            if (domain === whitelistedDomain) {
                return true;
            }
            if (whitelistedDomain.startsWith('*.')) {
                const baseDomain = whitelistedDomain.substring(2);
                if (domain.endsWith(`.${baseDomain}`) || domain === baseDomain) {
                    return true;
                }
            }
            if (domain.endsWith(`.${whitelistedDomain}`)) {
                return true;
            }
        }
        return false;
    }
    /**
	 * Extract client IP address from request
	 */ getClientIp(request) {
        return request.headers['x-forwarded-for']?.split(',')[0] || request.headers['x-real-ip'] || request.connection?.remoteAddress || request.socket?.remoteAddress || request.ip || 'unknown';
    }
    /**
	 * Determine request type for rate limiting
	 */ getRequestType(request) {
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
    /**
	 * Add rate limit headers to response
	 */ addRateLimitHeaders(response, info) {
        response.setHeader('X-RateLimit-Limit', info.limit.toString());
        response.setHeader('X-RateLimit-Remaining', info.remaining.toString());
        response.setHeader('X-RateLimit-Reset', Math.ceil(info.resetTime.getTime() / 1000).toString());
        response.setHeader('X-RateLimit-Used', info.current.toString());
    }
}
AdaptiveRateLimitGuard = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof RateLimitService === "undefined" ? Object : RateLimitService,
        typeof RateLimitMetricsService === "undefined" ? Object : RateLimitMetricsService
    ])
], AdaptiveRateLimitGuard);

//# sourceMappingURL=adaptive-rate-limit.guard.js.map