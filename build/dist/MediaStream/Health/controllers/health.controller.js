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
import { CacheHealthIndicator } from "../../Cache/indicators/cache-health.indicator.js";
import { RedisHealthIndicator } from "../../Cache/indicators/redis-health.indicator.js";
import { ConfigService } from "../../Config/config.service.js";
import { DiskSpaceHealthIndicator } from "../indicators/disk-space-health.indicator.js";
import { MemoryHealthIndicator } from "../indicators/memory-health.indicator.js";
import { HttpHealthIndicator } from "../../HTTP/indicators/http-health.indicator.js";
import { HttpClientService } from "../../HTTP/services/http-client.service.js";
import { AlertingHealthIndicator } from "../../Monitoring/indicators/alerting-health.indicator.js";
import { SystemHealthIndicator } from "../../Monitoring/indicators/system-health.indicator.js";
import { JobQueueHealthIndicator } from "../../Queue/indicators/job-queue-health.indicator.js";
import { StorageHealthIndicator } from "../../Storage/indicators/storage-health.indicator.js";
import { Controller, Get, Post } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
export class HealthController {
    constructor(health, diskSpaceIndicator, memoryIndicator, httpHealthIndicator, cacheHealthIndicator, redisHealthIndicator, alertingHealthIndicator, systemHealthIndicator, jobQueueHealthIndicator, storageHealthIndicator, _configService, httpClientService){
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
            ()=>this.diskSpaceIndicator.isHealthy(),
            ()=>this.memoryIndicator.isHealthy(),
            ()=>this.httpHealthIndicator.isHealthy(),
            ()=>this.cacheHealthIndicator.isHealthy(),
            ()=>this.redisHealthIndicator.isHealthy(),
            ()=>this.alertingHealthIndicator.isHealthy(),
            ()=>this.systemHealthIndicator.isHealthy(),
            ()=>this.jobQueueHealthIndicator.isHealthy(),
            ()=>this.storageHealthIndicator.isHealthy()
        ]);
    }
    async getDetailedHealth() {
        const healthResults = await this.health.check([
            ()=>this.diskSpaceIndicator.isHealthy(),
            ()=>this.memoryIndicator.isHealthy(),
            ()=>this.httpHealthIndicator.isHealthy(),
            ()=>this.cacheHealthIndicator.isHealthy(),
            ()=>this.redisHealthIndicator.isHealthy(),
            ()=>this.alertingHealthIndicator.isHealthy(),
            ()=>this.systemHealthIndicator.isHealthy(),
            ()=>this.jobQueueHealthIndicator.isHealthy(),
            ()=>this.storageHealthIndicator.isHealthy()
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
                pid: process.pid
            },
            resources: {
                disk: diskInfo,
                memory: memoryInfo
            },
            configuration: {
                monitoring: {
                    enabled: this._configService.get('monitoring.enabled'),
                    metricsPort: this._configService.get('monitoring.metricsPort')
                },
                cache: {
                    fileDirectory: this._configService.get('cache.file.directory'),
                    memoryMaxSize: this._configService.get('cache.memory.maxSize')
                }
            }
        };
    }
    async readiness() {
        try {
            const result = await this.health.check([
                ()=>this.diskSpaceIndicator.isHealthy(),
                ()=>this.memoryIndicator.isHealthy(),
                ()=>this.httpHealthIndicator.isHealthy(),
                ()=>this.cacheHealthIndicator.isHealthy(),
                ()=>this.redisHealthIndicator.isHealthy(),
                ()=>this.alertingHealthIndicator.isHealthy(),
                ()=>this.systemHealthIndicator.isHealthy(),
                ()=>this.jobQueueHealthIndicator.isHealthy(),
                ()=>this.storageHealthIndicator.isHealthy()
            ]);
            return {
                status: 'ready',
                timestamp: new Date().toISOString(),
                checks: result.details
            };
        } catch (error) {
            return {
                status: 'not ready',
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    async liveness() {
        return {
            status: 'alive',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            pid: process.pid
        };
    }
    async circuitBreakerStatus() {
        const isOpen = this.httpClientService.isCircuitOpen();
        const httpStats = this.httpClientService.getStats();
        return {
            timestamp: new Date().toISOString(),
            circuitBreaker: {
                isOpen,
                stats: httpStats
            },
            httpClient: {
                stats: httpStats
            }
        };
    }
    async resetCircuitBreaker() {
        const previousStats = this.httpClientService.getStats();
        this.httpClientService.resetCircuitBreaker();
        this.httpClientService.resetStats();
        return {
            timestamp: new Date().toISOString(),
            message: 'Circuit breaker has been reset successfully',
            previousState: previousStats
        };
    }
}
_ts_decorate([
    Get(),
    HealthCheck(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], HealthController.prototype, "check", null);
_ts_decorate([
    Get('detailed'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], HealthController.prototype, "getDetailedHealth", null);
_ts_decorate([
    Get('ready'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], HealthController.prototype, "readiness", null);
_ts_decorate([
    Get('live'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], HealthController.prototype, "liveness", null);
_ts_decorate([
    Get('circuit-breaker'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], HealthController.prototype, "circuitBreakerStatus", null);
_ts_decorate([
    Post('circuit-breaker/reset'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], HealthController.prototype, "resetCircuitBreaker", null);
HealthController = _ts_decorate([
    Controller('health'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof HealthCheckService === "undefined" ? Object : HealthCheckService,
        typeof DiskSpaceHealthIndicator === "undefined" ? Object : DiskSpaceHealthIndicator,
        typeof MemoryHealthIndicator === "undefined" ? Object : MemoryHealthIndicator,
        typeof HttpHealthIndicator === "undefined" ? Object : HttpHealthIndicator,
        typeof CacheHealthIndicator === "undefined" ? Object : CacheHealthIndicator,
        typeof RedisHealthIndicator === "undefined" ? Object : RedisHealthIndicator,
        typeof AlertingHealthIndicator === "undefined" ? Object : AlertingHealthIndicator,
        typeof SystemHealthIndicator === "undefined" ? Object : SystemHealthIndicator,
        typeof JobQueueHealthIndicator === "undefined" ? Object : JobQueueHealthIndicator,
        typeof StorageHealthIndicator === "undefined" ? Object : StorageHealthIndicator,
        typeof ConfigService === "undefined" ? Object : ConfigService,
        typeof HttpClientService === "undefined" ? Object : HttpClientService
    ])
], HealthController);

//# sourceMappingURL=health.controller.js.map