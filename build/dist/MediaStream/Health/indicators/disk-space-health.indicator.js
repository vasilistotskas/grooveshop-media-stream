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
exports.DiskSpaceHealthIndicator = void 0;
const node_fs_1 = require("node:fs");
const config_service_1 = require("../../Config/config.service");
const common_1 = require("@nestjs/common");
const base_health_indicator_1 = require("../base/base-health-indicator");
let DiskSpaceHealthIndicator = class DiskSpaceHealthIndicator extends base_health_indicator_1.BaseHealthIndicator {
    constructor(configService) {
        const options = {
            timeout: 3000,
            threshold: 0.9,
        };
        super('disk_space', options);
        this.configService = configService;
        this.storagePath = this.configService.get('cache.file.directory');
        this.warningThreshold = 0.8;
        this.criticalThreshold = 0.9;
    }
    async performHealthCheck() {
        return this.executeWithTimeout(async () => {
            const diskInfo = await this.getDiskSpaceInfo();
            if (diskInfo.usedPercentage >= this.criticalThreshold) {
                return this.createUnhealthyResult(`Disk space critically low: ${(diskInfo.usedPercentage * 100).toFixed(1)}% used`, diskInfo);
            }
            const detailStatus = diskInfo.usedPercentage >= this.warningThreshold ? 'warning' : 'healthy';
            return this.createHealthyResult({
                ...diskInfo,
                detailStatus,
                warningThreshold: this.warningThreshold,
                criticalThreshold: this.criticalThreshold,
            });
        });
    }
    getDescription() {
        return `Monitors disk space usage for storage directory: ${this.storagePath}`;
    }
    async getDiskSpaceInfo() {
        try {
            await node_fs_1.promises.mkdir(this.storagePath, { recursive: true });
            const stats = await node_fs_1.promises.statfs(this.storagePath);
            const total = stats.blocks * stats.bsize;
            const free = stats.bavail * stats.bsize;
            const used = total - free;
            const usedPercentage = used / total;
            return {
                total: this.formatBytes(total),
                free: this.formatBytes(free),
                used: this.formatBytes(used),
                usedPercentage,
                path: this.storagePath,
            };
        }
        catch (error) {
            console.error(error);
            return this.getFallbackDiskInfo();
        }
    }
    async getFallbackDiskInfo() {
        try {
            return {
                total: 0,
                free: 0,
                used: 0,
                usedPercentage: 0,
                path: this.storagePath,
            };
        }
        catch (error) {
            console.error(error);
            throw new Error(`Unable to access storage directory: ${this.storagePath}`);
        }
    }
    formatBytes(bytes) {
        return Math.round(bytes / (1024 * 1024));
    }
    async getCurrentDiskInfo() {
        return this.getDiskSpaceInfo();
    }
};
exports.DiskSpaceHealthIndicator = DiskSpaceHealthIndicator;
exports.DiskSpaceHealthIndicator = DiskSpaceHealthIndicator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], DiskSpaceHealthIndicator);
//# sourceMappingURL=disk-space-health.indicator.js.map