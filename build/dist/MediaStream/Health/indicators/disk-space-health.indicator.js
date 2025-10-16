function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { promises as fs } from "node:fs";
import { ConfigService } from "../../Config/config.service.js";
import { Injectable } from "@nestjs/common";
import { BaseHealthIndicator } from "../base/base-health-indicator.js";
export class DiskSpaceHealthIndicator extends BaseHealthIndicator {
    async performHealthCheck() {
        return this.executeWithTimeout(async ()=>{
            const diskInfo = await this.getDiskSpaceInfo();
            if (diskInfo.usedPercentage >= this._criticalThreshold) {
                return this.createUnhealthyResult(`Disk space critically low: ${(diskInfo.usedPercentage * 100).toFixed(1)}% used`, diskInfo);
            }
            const detailStatus = diskInfo.usedPercentage >= this._warningThreshold ? 'warning' : 'healthy';
            return this.createHealthyResult({
                ...diskInfo,
                detailStatus,
                warningThreshold: this._warningThreshold,
                criticalThreshold: this._criticalThreshold
            });
        });
    }
    getDescription() {
        return `Monitors disk space usage for storage directory: ${this.storagePath}`;
    }
    async getDiskSpaceInfo() {
        try {
            await fs.mkdir(this.storagePath, {
                recursive: true
            });
            const stats = await fs.statfs(this.storagePath);
            const total = stats.blocks * stats.bsize;
            const free = stats.bavail * stats.bsize;
            const used = total - free;
            const usedPercentage = used / total;
            return {
                total: this.formatBytes(total),
                free: this.formatBytes(free),
                used: this.formatBytes(used),
                usedPercentage,
                path: this.storagePath
            };
        } catch (error) {
            // Fallback for systems that don't support statvfs
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
                path: this.storagePath
            };
        } catch (error) {
            console.error(error);
            throw new Error(`Unable to access storage directory: ${this.storagePath}`);
        }
    }
    formatBytes(bytes) {
        return Math.round(bytes / (1024 * 1024));
    }
    /**
	 * Get current disk space information without health check wrapper
	 */ async getCurrentDiskInfo() {
        return this.getDiskSpaceInfo();
    }
    constructor(_configService){
        const options = {
            timeout: 3000,
            threshold: 0.9
        };
        super('disk_space', options), this._configService = _configService;
        this.storagePath = this._configService.get('cache.file.directory');
        this._warningThreshold = 0.8;
        this._criticalThreshold = 0.9;
    }
}
DiskSpaceHealthIndicator = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ConfigService === "undefined" ? Object : ConfigService
    ])
], DiskSpaceHealthIndicator);

//# sourceMappingURL=disk-space-health.indicator.js.map