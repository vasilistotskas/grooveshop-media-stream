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
var HttpClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpClientService = void 0;
const http = __importStar(require("node:http"));
const https = __importStar(require("node:https"));
const node_perf_hooks_1 = require("node:perf_hooks");
const config_service_1 = require("../../Config/config.service");
const logger_util_1 = require("../../Correlation/utils/logger.util");
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const circuit_breaker_1 = require("../utils/circuit-breaker");
let HttpClientService = HttpClientService_1 = class HttpClientService {
    constructor(_httpService, _configService) {
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
            queueSize: 0,
        };
        this.totalResponseTime = 0;
        this.maxRetries = this._configService.getOptional('http.retry.retries', 3);
        this.retryDelay = this._configService.getOptional('http.retry.retryDelay', 1000);
        this.maxRetryDelay = this._configService.getOptional('http.retry.maxRetryDelay', 10000);
        this.timeout = this._configService.getOptional('http.connectionPool.timeout', 30000);
        this.circuitBreaker = new circuit_breaker_1.CircuitBreaker({
            failureThreshold: this._configService.getOptional('http.circuitBreaker.failureThreshold', 5),
            resetTimeout: this._configService.getOptional('http.circuitBreaker.resetTimeout', 60000),
            rollingWindow: this._configService.getOptional('http.circuitBreaker.monitoringPeriod', 30000),
            minimumRequests: 5,
        });
        const maxSockets = this._configService.getOptional('http.connectionPool.maxSockets', 50);
        const keepAliveMsecs = this._configService.getOptional('http.connectionPool.keepAliveMsecs', 1000);
        this.httpAgent = new http.Agent({
            keepAlive: true,
            keepAliveMsecs,
            maxSockets,
        });
        this.httpsAgent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs,
            maxSockets,
        });
        this.configureAxios();
    }
    async onModuleInit() {
        logger_util_1.CorrelatedLogger.log('HTTP client service initialized', HttpClientService_1.name);
    }
    async onModuleDestroy() {
        this.httpAgent.destroy();
        this.httpsAgent.destroy();
        logger_util_1.CorrelatedLogger.log('HTTP client service destroyed', HttpClientService_1.name);
    }
    async get(url, config) {
        return this.executeRequest(() => this._httpService.get(url, this.prepareConfig(config)));
    }
    async post(url, data, config) {
        return this.executeRequest(() => this._httpService.post(url, data, this.prepareConfig(config)));
    }
    async put(url, data, config) {
        return this.executeRequest(() => this._httpService.put(url, data, this.prepareConfig(config)));
    }
    async delete(url, config) {
        return this.executeRequest(() => this._httpService.delete(url, this.prepareConfig(config)));
    }
    async head(url, config) {
        return this.executeRequest(() => this._httpService.head(url, this.prepareConfig(config)));
    }
    async patch(url, data, config) {
        return this.executeRequest(() => this._httpService.patch(url, data, this.prepareConfig(config)));
    }
    async request(config) {
        return this.executeRequest(() => this._httpService.request(this.prepareConfig(config)));
    }
    getStats() {
        return {
            ...this.stats,
            circuitBreakerState: this.circuitBreaker.getState(),
        };
    }
    resetStats() {
        this.stats.totalRequests = 0;
        this.stats.successfulRequests = 0;
        this.stats.failedRequests = 0;
        this.stats.retriedRequests = 0;
        this.stats.averageResponseTime = 0;
        this.totalResponseTime = 0;
        logger_util_1.CorrelatedLogger.debug('HTTP client statistics reset', HttpClientService_1.name);
    }
    isCircuitOpen() {
        return this.circuitBreaker.isOpen();
    }
    resetCircuitBreaker() {
        this.circuitBreaker.reset();
    }
    async executeRequest(requestFn) {
        if (this.circuitBreaker.isOpen()) {
            throw new Error('Circuit breaker is open');
        }
        const startTime = node_perf_hooks_1.performance.now();
        this.stats.activeRequests++;
        this.stats.totalRequests++;
        try {
            const response = await (0, rxjs_1.lastValueFrom)(requestFn().pipe((0, operators_1.retry)({
                count: this.maxRetries,
                delay: (error, retryCount) => {
                    if (!this.isRetryableError(error)) {
                        return (0, rxjs_1.throwError)(() => error);
                    }
                    this.stats.retriedRequests++;
                    const delayMs = Math.min(this.retryDelay * 2 ** (retryCount - 1), this.maxRetryDelay);
                    logger_util_1.CorrelatedLogger.warn(`Retrying request (attempt ${retryCount}/${this.maxRetries}) after ${delayMs}ms: ${error.message}`, HttpClientService_1.name);
                    return (0, rxjs_1.timer)(delayMs);
                },
            }), (0, operators_1.tap)({
                error: (error) => {
                    this.stats.failedRequests++;
                    this.circuitBreaker.recordFailure();
                    logger_util_1.CorrelatedLogger.error(`HTTP request failed: ${error.message}`, error.stack, HttpClientService_1.name);
                },
                next: (response) => {
                    this.stats.successfulRequests++;
                    this.circuitBreaker.recordSuccess();
                    logger_util_1.CorrelatedLogger.debug(`HTTP request succeeded: ${response.config?.method?.toUpperCase()} ${response.config?.url} ${response.status}`, HttpClientService_1.name);
                },
            })));
            const responseTime = node_perf_hooks_1.performance.now() - startTime;
            this.totalResponseTime += responseTime;
            this.stats.averageResponseTime = this.totalResponseTime / this.stats.successfulRequests;
            return response;
        }
        catch (error) {
            const responseTime = node_perf_hooks_1.performance.now() - startTime;
            this.totalResponseTime += responseTime;
            throw error;
        }
        finally {
            this.stats.activeRequests--;
        }
    }
    isRetryableError(error) {
        if (error.code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(error.code)) {
            return true;
        }
        if (error.response && [408, 429, 500, 502, 503, 504].includes(error.response.status)) {
            return true;
        }
        return false;
    }
    prepareConfig(config = {}) {
        return {
            ...config,
            timeout: config.timeout || this.timeout,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
        };
    }
    configureAxios() {
        this._httpService.axiosRef.defaults.timeout = this.timeout;
    }
};
exports.HttpClientService = HttpClientService;
exports.HttpClientService = HttpClientService = HttpClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_service_1.ConfigService])
], HttpClientService);
//# sourceMappingURL=http-client.service.js.map