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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const process = __importStar(require("node:process"));
const cache_health_indicator_1 = require("../../Cache/indicators/cache-health.indicator");
const redis_health_indicator_1 = require("../../Cache/indicators/redis-health.indicator");
const config_service_1 = require("../../Config/config.service");
const disk_space_health_indicator_1 = require("../indicators/disk-space-health.indicator");
const memory_health_indicator_1 = require("../indicators/memory-health.indicator");
const http_health_indicator_1 = require("../../HTTP/indicators/http-health.indicator");
const http_client_service_1 = require("../../HTTP/services/http-client.service");
const alerting_health_indicator_1 = require("../../Monitoring/indicators/alerting-health.indicator");
const system_health_indicator_1 = require("../../Monitoring/indicators/system-health.indicator");
const job_queue_health_indicator_1 = require("../../Queue/indicators/job-queue-health.indicator");
const storage_health_indicator_1 = require("../../Storage/indicators/storage-health.indicator");
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
let HealthController = class HealthController {
    constructor(health, diskSpaceIndicator, memoryIndicator, httpHealthIndicator, cacheHealthIndicator, redisHealthIndicator, alertingHealthIndicator, systemHealthIndicator, jobQueueHealthIndicator, storageHealthIndicator, _configService, httpClientService) {
        this.health = health;
        this.diskSpaceIndicator = diskSpaceIndicator;
        this.memoryIndicator = memoryIndicator;
        this.httpHealthIndicator = httpHealthIndicator;
        this.cacheHealthIndicator = cacheHealthIndicator;
        this.redisHealthIndicator = redisHealthIndicator;
        this.alertingHealthIndicator = alertingHealthIndicator;
        this.systemHealthIndicator = systemHealthIndicator;
        this.jobQueueHealthIndicator = jobQueueHealthIndicator;
        this.storageHealthIndicator = storageHealthIndicator;
        this._configService = _configService;
        this.httpClientService = httpClientService;
    }
    async check() {
        return this.health.check([
            () => this.diskSpaceIndicator.isHealthy(),
            () => this.memoryIndicator.isHealthy(),
            () => this.httpHealthIndicator.isHealthy(),
            () => this.cacheHealthIndicator.isHealthy(),
            () => this.redisHealthIndicator.isHealthy(),
            () => this.alertingHealthIndicator.isHealthy(),
            () => this.systemHealthIndicator.isHealthy(),
            () => this.jobQueueHealthIndicator.isHealthy(),
            () => this.storageHealthIndicator.isHealthy(),
        ]);
    }
    async getDetailedHealth() {
        const healthResults = await this.health.check([
            () => this.diskSpaceIndicator.isHealthy(),
            () => this.memoryIndicator.isHealthy(),
            () => this.httpHealthIndicator.isHealthy(),
            () => this.cacheHealthIndicator.isHealthy(),
            () => this.redisHealthIndicator.isHealthy(),
            () => this.alertingHealthIndicator.isHealthy(),
            () => this.systemHealthIndicator.isHealthy(),
            () => this.jobQueueHealthIndicator.isHealthy(),
            () => this.storageHealthIndicator.isHealthy(),
        ]);
        const diskInfo = await this.diskSpaceIndicator.getCurrentDiskInfo();
        const memoryInfo = this.memoryIndicator.getCurrentMemoryInfo();
        return {
            status: healthResults.status,
            info: healthResults.info || {},
            error: healthResults.error || {},
            details: healthResults.details,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.version,
            environment: process.env.NODE_ENV || 'development',
            systemInfo: {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                pid: process.pid,
            },
            resources: {
                disk: diskInfo,
                memory: memoryInfo,
            },
            configuration: {
                monitoring: {
                    enabled: this._configService.get('monitoring.enabled'),
                    metricsPort: this._configService.get('monitoring.metricsPort'),
                },
                cache: {
                    fileDirectory: this._configService.get('cache.file.directory'),
                    memoryMaxSize: this._configService.get('cache.memory.maxSize'),
                },
            },
        };
    }
    async readiness() {
        try {
            const result = await this.health.check([
                () => this.diskSpaceIndicator.isHealthy(),
                () => this.memoryIndicator.isHealthy(),
                () => this.httpHealthIndicator.isHealthy(),
                () => this.cacheHealthIndicator.isHealthy(),
                () => this.redisHealthIndicator.isHealthy(),
                () => this.alertingHealthIndicator.isHealthy(),
                () => this.systemHealthIndicator.isHealthy(),
                () => this.jobQueueHealthIndicator.isHealthy(),
                () => this.storageHealthIndicator.isHealthy(),
            ]);
            return {
                status: 'ready',
                timestamp: new Date().toISOString(),
                checks: result.details,
            };
        }
        catch (error) {
            return {
                status: 'not ready',
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    async liveness() {
        return {
            status: 'alive',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            pid: process.pid,
        };
    }
    async circuitBreakerStatus() {
        const isOpen = this.httpClientService.isCircuitOpen();
        const httpStats = this.httpClientService.getStats();
        return {
            timestamp: new Date().toISOString(),
            circuitBreaker: {
                isOpen,
                stats: httpStats,
            },
            httpClient: {
                stats: httpStats,
            },
        };
    }
    async resetCircuitBreaker() {
        const previousStats = this.httpClientService.getStats();
        this.httpClientService.resetCircuitBreaker();
        this.httpClientService.resetStats();
        return {
            timestamp: new Date().toISOString(),
            message: 'Circuit breaker has been reset successfully',
            previousState: previousStats,
        };
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    (0, terminus_1.HealthCheck)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "check", null);
__decorate([
    (0, common_1.Get)('detailed'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "getDetailedHealth", null);
__decorate([
    (0, common_1.Get)('ready'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "readiness", null);
__decorate([
    (0, common_1.Get)('live'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "liveness", null);
__decorate([
    (0, common_1.Get)('circuit-breaker'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "circuitBreakerStatus", null);
__decorate([
    (0, common_1.Post)('circuit-breaker/reset'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "resetCircuitBreaker", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [terminus_1.HealthCheckService,
        disk_space_health_indicator_1.DiskSpaceHealthIndicator,
        memory_health_indicator_1.MemoryHealthIndicator,
        http_health_indicator_1.HttpHealthIndicator,
        cache_health_indicator_1.CacheHealthIndicator,
        redis_health_indicator_1.RedisHealthIndicator,
        alerting_health_indicator_1.AlertingHealthIndicator,
        system_health_indicator_1.SystemHealthIndicator,
        job_queue_health_indicator_1.JobQueueHealthIndicator,
        storage_health_indicator_1.StorageHealthIndicator,
        config_service_1.ConfigService,
        http_client_service_1.HttpClientService])
], HealthController);
//# sourceMappingURL=health.controller.js.map