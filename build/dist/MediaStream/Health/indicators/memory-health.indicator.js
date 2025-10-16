function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import * as os from "node:os";
import * as process from "node:process";
import { Injectable } from "@nestjs/common";
import { BaseHealthIndicator } from "../base/base-health-indicator.js";
export class MemoryHealthIndicator extends BaseHealthIndicator {
    constructor(){
        const options = {
            timeout: 1000,
            threshold: 0.95
        };
        super('memory', options);
        this._warningThreshold = 0.85;
        this._criticalThreshold = 0.95;
        this.heapWarningThreshold = 0.90;
        this.heapCriticalThreshold = 0.98;
    }
    async performHealthCheck() {
        return this.executeWithTimeout(async ()=>{
            const memoryInfo = this.getMemoryInfo();
            if (memoryInfo.memoryUsagePercentage >= this._criticalThreshold) {
                return this.createUnhealthyResult(`System memory critically high: ${(memoryInfo.memoryUsagePercentage * 100).toFixed(1)}% used`, memoryInfo);
            }
            if (memoryInfo.heapUsagePercentage >= this.heapCriticalThreshold) {
                return this.createUnhealthyResult(`Heap memory critically high: ${(memoryInfo.heapUsagePercentage * 100).toFixed(1)}% used`, memoryInfo);
            }
            let detailStatus = 'healthy';
            if (memoryInfo.memoryUsagePercentage >= this._warningThreshold || memoryInfo.heapUsagePercentage >= this.heapWarningThreshold) {
                detailStatus = 'warning';
            }
            return this.createHealthyResult({
                ...memoryInfo,
                detailStatus,
                thresholds: {
                    systemMemoryWarning: this._warningThreshold,
                    systemMemoryCritical: this._criticalThreshold,
                    heapMemoryWarning: this.heapWarningThreshold,
                    heapMemoryCritical: this.heapCriticalThreshold
                }
            });
        });
    }
    getDescription() {
        return 'Monitors system and process memory usage';
    }
    getMemoryInfo() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryUsagePercentage = usedMemory / totalMemory;
        const processMemory = process.memoryUsage();
        const heapUsagePercentage = processMemory.heapUsed / processMemory.rss;
        return {
            totalMemory: this.formatBytes(totalMemory),
            freeMemory: this.formatBytes(freeMemory),
            usedMemory: this.formatBytes(usedMemory),
            memoryUsagePercentage,
            processMemory: {
                rss: this.formatBytes(processMemory.rss),
                heapTotal: this.formatBytes(processMemory.heapTotal),
                heapUsed: this.formatBytes(processMemory.heapUsed),
                external: this.formatBytes(processMemory.external),
                arrayBuffers: this.formatBytes(processMemory.arrayBuffers)
            },
            heapUsagePercentage
        };
    }
    formatBytes(bytes) {
        return Math.round(bytes / (1024 * 1024));
    }
    /**
	 * Get current memory information without health check wrapper
	 */ getCurrentMemoryInfo() {
        return this.getMemoryInfo();
    }
    /**
	 * Force garbage collection if available (for testing/debugging)
	 */ forceGarbageCollection() {
        if (globalThis.gc) {
            globalThis.gc();
            return true;
        }
        return false;
    }
}
MemoryHealthIndicator = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [])
], MemoryHealthIndicator);

//# sourceMappingURL=memory-health.indicator.js.map