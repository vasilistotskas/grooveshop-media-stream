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
import { CorrelatedLogger } from "../../Correlation/utils/logger.util.js";
import { BaseHealthIndicator } from "../../Health/base/base-health-indicator.js";
import { Injectable } from "@nestjs/common";
import { HttpClientService } from "../services/http-client.service.js";
export class HttpHealthIndicator extends BaseHealthIndicator {
    constructor(httpClient, _configService){
        super('http'), this.httpClient = httpClient, this._configService = _configService;
        this.healthCheckUrls = this._configService.getOptional('http.healthCheck.urls', []);
        this.timeout = this._configService.getOptional('http.healthCheck.timeout', 5000);
    }
    async performHealthCheck() {
        const stats = this.httpClient.getStats();
        const circuitBreakerOpen = this.httpClient.isCircuitOpen();
        if (!this.healthCheckUrls || this.healthCheckUrls.length === 0) {
            if (circuitBreakerOpen) {
                return this.createUnhealthyResult('Circuit breaker is open', {
                    circuitBreaker: 'open',
                    checks: [],
                    stats
                });
            }
            return this.createHealthyResult({
                circuitBreaker: 'closed',
                checks: [],
                stats
            });
        }
        try {
            const results = await Promise.allSettled(this.healthCheckUrls.map(async (url)=>{
                try {
                    const startTime = Date.now();
                    const response = await this.httpClient.get(url, {
                        timeout: this.timeout
                    });
                    const responseTime = Date.now() - startTime;
                    return {
                        url,
                        status: response.status,
                        responseTime,
                        success: response.status >= 200 && response.status < 300
                    };
                } catch (error) {
                    return {
                        url,
                        error: error.message,
                        success: false
                    };
                }
            }));
            const checks = results.map((result)=>{
                if (result.status === 'fulfilled') {
                    return result.value;
                } else {
                    return {
                        url: 'unknown',
                        error: result.reason.message,
                        success: false
                    };
                }
            });
            const successCount = checks.filter((check)=>check.success).length;
            const isHealthy = successCount === checks.length && !circuitBreakerOpen;
            if (!isHealthy) {
                CorrelatedLogger.warn(`HTTP health check failed: ${successCount}/${checks.length} endpoints healthy, circuit breaker: ${circuitBreakerOpen}`, HttpHealthIndicator.name);
            }
            if (!isHealthy) {
                return this.createUnhealthyResult(`${successCount}/${checks.length} endpoints healthy, circuit breaker: ${circuitBreakerOpen}`, {
                    circuitBreaker: circuitBreakerOpen ? 'open' : 'closed',
                    checks,
                    stats
                });
            }
            return this.createHealthyResult({
                circuitBreaker: circuitBreakerOpen ? 'open' : 'closed',
                checks,
                stats
            });
        } catch (error) {
            CorrelatedLogger.error(`HTTP health check error: ${error.message}`, error.stack, HttpHealthIndicator.name);
            return this.createUnhealthyResult(error.message, {
                circuitBreaker: circuitBreakerOpen ? 'open' : 'closed',
                checks: [
                    {
                        url: 'unknown',
                        error: error.message,
                        success: false
                    }
                ],
                stats
            });
        }
    }
    getDescription() {
        return 'Monitors HTTP connection health including circuit breaker status and external endpoint connectivity';
    }
}
HttpHealthIndicator = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof HttpClientService === "undefined" ? Object : HttpClientService,
        typeof ConfigService === "undefined" ? Object : ConfigService
    ])
], HttpHealthIndicator);

//# sourceMappingURL=http-health.indicator.js.map