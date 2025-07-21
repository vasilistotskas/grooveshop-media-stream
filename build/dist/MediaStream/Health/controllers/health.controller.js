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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const disk_space_health_indicator_1 = require("../indicators/disk-space-health.indicator");
const memory_health_indicator_1 = require("../indicators/memory-health.indicator");
const http_health_indicator_1 = require("../../HTTP/indicators/http-health.indicator");
const config_service_1 = require("../../Config/config.service");
let HealthController = class HealthController {
    constructor(health, diskSpaceIndicator, memoryIndicator, httpHealthIndicator, configService) {
        this.health = health;
        this.diskSpaceIndicator = diskSpaceIndicator;
        this.memoryIndicator = memoryIndicator;
        this.httpHealthIndicator = httpHealthIndicator;
        this.configService = configService;
    }
    async check() {
        return this.health.check([
            () => this.diskSpaceIndicator.isHealthy(),
            () => this.memoryIndicator.isHealthy(),
            () => this.httpHealthIndicator.isHealthy('http')
        ]);
    }
    async getDetailedHealth() {
        const healthResults = await this.health.check([
            () => this.diskSpaceIndicator.isHealthy(),
            () => this.memoryIndicator.isHealthy(),
            () => this.httpHealthIndicator.isHealthy('http')
        ]);
        const diskInfo = await this.diskSpaceIndicator.getCurrentDiskInfo();
        const memoryInfo = this.memoryIndicator.getCurrentMemoryInfo();
        return {
            status: healthResults.status,
            info: healthResults.info,
            error: healthResults.error,
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
                    enabled: this.configService.get('monitoring.enabled'),
                    metricsPort: this.configService.get('monitoring.metricsPort')
                },
                cache: {
                    fileDirectory: this.configService.get('cache.file.directory'),
                    memoryMaxSize: this.configService.get('cache.memory.maxSize')
                }
            }
        };
    }
    async readiness() {
        try {
            const result = await this.health.check([
                () => this.diskSpaceIndicator.isHealthy(),
                () => this.memoryIndicator.isHealthy(),
                () => this.httpHealthIndicator.isHealthy('http')
            ]);
            return {
                status: 'ready',
                timestamp: new Date().toISOString(),
                checks: result.details
            };
        }
        catch (error) {
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
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [terminus_1.HealthCheckService,
        disk_space_health_indicator_1.DiskSpaceHealthIndicator,
        memory_health_indicator_1.MemoryHealthIndicator,
        http_health_indicator_1.HttpHealthIndicator,
        config_service_1.ConfigService])
], HealthController);
//# sourceMappingURL=health.controller.js.map