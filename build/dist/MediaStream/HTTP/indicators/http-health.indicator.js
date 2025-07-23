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
var HttpHealthIndicator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpHealthIndicator = void 0;
const config_service_1 = require("../../Config/config.service");
const logger_util_1 = require("../../Correlation/utils/logger.util");
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const http_client_service_1 = require("../services/http-client.service");
let HttpHealthIndicator = HttpHealthIndicator_1 = class HttpHealthIndicator extends terminus_1.HealthIndicator {
    constructor(httpClient, configService) {
        super();
        this.httpClient = httpClient;
        this.configService = configService;
        this.healthCheckUrls = this.configService.getOptional('http.healthCheck.urls', []);
        this.timeout = this.configService.getOptional('http.healthCheck.timeout', 5000);
    }
    async isHealthy(key) {
        const stats = this.httpClient.getStats();
        const circuitBreakerOpen = this.httpClient.isCircuitOpen();
        if (!this.healthCheckUrls || this.healthCheckUrls.length === 0) {
            return this.getStatus(key, !circuitBreakerOpen, {
                circuitBreaker: circuitBreakerOpen ? 'open' : 'closed',
                stats,
            });
        }
        try {
            const results = await Promise.allSettled(this.healthCheckUrls.map(async (url) => {
                try {
                    const startTime = Date.now();
                    const response = await this.httpClient.get(url, { timeout: this.timeout });
                    const responseTime = Date.now() - startTime;
                    return {
                        url,
                        status: response.status,
                        responseTime,
                        success: response.status >= 200 && response.status < 300,
                    };
                }
                catch (error) {
                    return {
                        url,
                        error: error.message,
                        success: false,
                    };
                }
            }));
            const checks = results.map((result) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                }
                else {
                    return {
                        error: result.reason.message,
                        success: false,
                    };
                }
            });
            const successCount = checks.filter(check => check.success).length;
            const isHealthy = successCount === checks.length && !circuitBreakerOpen;
            if (!isHealthy) {
                logger_util_1.CorrelatedLogger.warn(`HTTP health check failed: ${successCount}/${checks.length} endpoints healthy`, HttpHealthIndicator_1.name);
            }
            return this.getStatus(key, isHealthy, {
                circuitBreaker: circuitBreakerOpen ? 'open' : 'closed',
                checks,
                stats,
            });
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`HTTP health check error: ${error.message}`, error.stack, HttpHealthIndicator_1.name);
            return this.getStatus(key, false, {
                error: error.message,
                circuitBreaker: circuitBreakerOpen ? 'open' : 'closed',
                stats,
            });
        }
    }
    getDetails() {
        return {
            name: 'HTTP Health Indicator',
            description: 'Monitors HTTP connection health',
            checks: [
                'Circuit breaker status',
                'External endpoint connectivity',
                'Response times',
                'Success rates',
            ],
        };
    }
};
exports.HttpHealthIndicator = HttpHealthIndicator;
exports.HttpHealthIndicator = HttpHealthIndicator = HttpHealthIndicator_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [http_client_service_1.HttpClientService,
        config_service_1.ConfigService])
], HttpHealthIndicator);
//# sourceMappingURL=http-health.indicator.js.map