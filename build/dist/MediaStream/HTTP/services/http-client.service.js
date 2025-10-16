function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import * as http from "node:http";
import * as https from "node:https";
import { performance } from "node:perf_hooks";
import { ConfigService } from "../../Config/config.service.js";
import { CorrelatedLogger } from "../../Correlation/utils/logger.util.js";
import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { lastValueFrom, throwError, timer } from "rxjs";
import { retry, tap } from "rxjs/operators";
import { CircuitBreaker } from "../utils/circuit-breaker.js";
export class HttpClientService {
    async onModuleInit() {
        CorrelatedLogger.log('HTTP client service initialized', HttpClientService.name);
    }
    async onModuleDestroy() {
        this.httpAgent.destroy();
        this.httpsAgent.destroy();
        CorrelatedLogger.log('HTTP client service destroyed', HttpClientService.name);
    }
    /**
	 * Send a GET request
	 */ async get(url, config) {
        const encodedUrl = this.encodeUrl(url);
        return this.executeRequest(()=>this._httpService.get(encodedUrl, this.prepareConfig(config)));
    }
    /**
	 * Send a POST request
	 */ async post(url, data, config) {
        return this.executeRequest(()=>this._httpService.post(url, data, this.prepareConfig(config)));
    }
    /**
	 * Send a PUT request
	 */ async put(url, data, config) {
        return this.executeRequest(()=>this._httpService.put(url, data, this.prepareConfig(config)));
    }
    /**
	 * Send a DELETE request
	 */ async delete(url, config) {
        return this.executeRequest(()=>this._httpService.delete(url, this.prepareConfig(config)));
    }
    /**
	 * Send a HEAD request
	 */ async head(url, config) {
        return this.executeRequest(()=>this._httpService.head(url, this.prepareConfig(config)));
    }
    /**
	 * Send a PATCH request
	 */ async patch(url, data, config) {
        return this.executeRequest(()=>this._httpService.patch(url, data, this.prepareConfig(config)));
    }
    /**
	 * Send a request with custom config
	 */ async request(config) {
        return this.executeRequest(()=>this._httpService.request(this.prepareConfig(config)));
    }
    /**
	 * Get client statistics
	 */ getStats() {
        return {
            ...this.stats,
            circuitBreakerState: this.circuitBreaker.getState()
        };
    }
    /**
	 * Reset client statistics
	 */ resetStats() {
        this.stats.totalRequests = 0;
        this.stats.successfulRequests = 0;
        this.stats.failedRequests = 0;
        this.stats.retriedRequests = 0;
        this.stats.averageResponseTime = 0;
        this.totalResponseTime = 0;
        CorrelatedLogger.debug('HTTP client statistics reset', HttpClientService.name);
    }
    /**
	 * Check if the circuit breaker is open
	 */ isCircuitOpen() {
        return this.circuitBreaker.isOpen();
    }
    /**
	 * Reset the circuit breaker
	 */ resetCircuitBreaker() {
        this.circuitBreaker.reset();
    }
    /**
	 * Execute a request with circuit breaker and retry logic
	 */ async executeRequest(requestFn) {
        if (this.circuitBreaker.isOpen()) {
            throw new Error('Circuit breaker is open');
        }
        const startTime = performance.now();
        this.stats.activeRequests++;
        this.stats.totalRequests++;
        try {
            const response = await lastValueFrom(requestFn().pipe(retry({
                count: this.maxRetries,
                delay: (error, retryCount)=>{
                    if (!this.isRetryableError(error)) {
                        return throwError(()=>error);
                    }
                    this.stats.retriedRequests++;
                    const delayMs = Math.min(this.retryDelay * 2 ** (retryCount - 1), this.maxRetryDelay);
                    CorrelatedLogger.warn(`Retrying request (attempt ${retryCount}/${this.maxRetries}) after ${delayMs}ms: ${error.message}`, HttpClientService.name);
                    return timer(delayMs);
                }
            }), tap({
                error: (error)=>{
                    this.stats.failedRequests++;
                    this.circuitBreaker.recordFailure();
                    CorrelatedLogger.error(`HTTP request failed: ${error.message}`, error.stack, HttpClientService.name);
                },
                next: (response)=>{
                    this.stats.successfulRequests++;
                    this.circuitBreaker.recordSuccess();
                    CorrelatedLogger.debug(`HTTP request succeeded: ${response.config?.method?.toUpperCase()} ${response.config?.url} ${response.status}`, HttpClientService.name);
                }
            })));
            const responseTime = performance.now() - startTime;
            this.totalResponseTime += responseTime;
            this.stats.averageResponseTime = this.totalResponseTime / this.stats.successfulRequests;
            return response;
        } catch (error) {
            const responseTime = performance.now() - startTime;
            this.totalResponseTime += responseTime;
            throw error;
        } finally{
            this.stats.activeRequests--;
        }
    }
    /**
	 * Check if an error is retryable
	 */ isRetryableError(error) {
        if (error.code && [
            'ECONNRESET',
            'ETIMEDOUT',
            'ECONNREFUSED',
            'ENOTFOUND'
        ].includes(error.code)) {
            return true;
        }
        if (error.response && [
            408,
            429,
            500,
            502,
            503,
            504
        ].includes(error.response.status)) {
            return true;
        }
        return false;
    }
    /**
	 * Prepare request configuration
	 */ prepareConfig(config = {}) {
        return {
            ...config,
            timeout: config.timeout || this.timeout,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent
        };
    }
    /**
	 * Configure axios defaults
	 */ configureAxios() {
        this._httpService.axiosRef.defaults.timeout = this.timeout;
    }
    /**
	 * Encode URL to handle non-ASCII characters properly
	 */ encodeUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname.split('/').map((segment)=>{
                // eslint-disable-next-line no-control-regex
                if (/[^\u0000-\u007F]/.test(segment)) {
                    return encodeURIComponent(segment);
                }
                return segment;
            });
            urlObj.pathname = pathSegments.join('/');
            return urlObj.toString();
        } catch (error) {
            CorrelatedLogger.warn(`Failed to encode URL: ${url} - ${error.message}`, HttpClientService.name);
            return url;
        }
    }
    constructor(_httpService, _configService){
        this._httpService = _httpService;
        this._configService = _configService;
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            retriedRequests: 0,
            averageResponseTime: 0,
            circuitBreakerState: 'closed',
            activeRequests: 0,
            queueSize: 0
        };
        this.totalResponseTime = 0;
        this.maxRetries = this._configService.getOptional('http.retry.retries', 3);
        this.retryDelay = this._configService.getOptional('http.retry.retryDelay', 1000);
        this.maxRetryDelay = this._configService.getOptional('http.retry.maxRetryDelay', 10000);
        this.timeout = this._configService.getOptional('http.connectionPool.timeout', 30000);
        this.circuitBreaker = new CircuitBreaker({
            failureThreshold: this._configService.getOptional('http.circuitBreaker.failureThreshold', 50),
            resetTimeout: this._configService.getOptional('http.circuitBreaker.resetTimeout', 30000),
            rollingWindow: this._configService.getOptional('http.circuitBreaker.monitoringPeriod', 60000),
            minimumRequests: this._configService.getOptional('http.circuitBreaker.minimumRequests', 10)
        });
        const maxSockets = this._configService.getOptional('http.connectionPool.maxSockets', 50);
        const keepAliveMsecs = this._configService.getOptional('http.connectionPool.keepAliveMsecs', 1000);
        this.httpAgent = new http.Agent({
            keepAlive: true,
            keepAliveMsecs,
            maxSockets
        });
        this.httpsAgent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs,
            maxSockets
        });
        this.configureAxios();
    }
}
HttpClientService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof HttpService === "undefined" ? Object : HttpService,
        typeof ConfigService === "undefined" ? Object : ConfigService
    ])
], HttpClientService);

//# sourceMappingURL=http-client.service.js.map