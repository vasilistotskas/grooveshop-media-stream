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
exports.MemoryHealthIndicator = void 0;
const os = __importStar(require("node:os"));
const process = __importStar(require("node:process"));
const common_1 = require("@nestjs/common");
const base_health_indicator_1 = require("../base/base-health-indicator");
let MemoryHealthIndicator = class MemoryHealthIndicator extends base_health_indicator_1.BaseHealthIndicator {
    constructor() {
        const options = {
            timeout: 1000,
            threshold: 0.9,
        };
        super('memory', options);
        this.warningThreshold = 0.8;
        this.criticalThreshold = 0.9;
        this.heapWarningThreshold = 0.8;
        this.heapCriticalThreshold = 0.9;
    }
    async performHealthCheck() {
        return this.executeWithTimeout(async () => {
            const memoryInfo = this.getMemoryInfo();
            if (memoryInfo.memoryUsagePercentage >= this.criticalThreshold) {
                return this.createUnhealthyResult(`System memory critically high: ${(memoryInfo.memoryUsagePercentage * 100).toFixed(1)}% used`, memoryInfo);
            }
            if (memoryInfo.heapUsagePercentage >= this.heapCriticalThreshold) {
                return this.createUnhealthyResult(`Heap memory critically high: ${(memoryInfo.heapUsagePercentage * 100).toFixed(1)}% used`, memoryInfo);
            }
            let detailStatus = 'healthy';
            if (memoryInfo.memoryUsagePercentage >= this.warningThreshold
                || memoryInfo.heapUsagePercentage >= this.heapWarningThreshold) {
                detailStatus = 'warning';
            }
            return this.createHealthyResult({
                ...memoryInfo,
                detailStatus,
                thresholds: {
                    systemMemoryWarning: this.warningThreshold,
                    systemMemoryCritical: this.criticalThreshold,
                    heapMemoryWarning: this.heapWarningThreshold,
                    heapMemoryCritical: this.heapCriticalThreshold,
                },
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
        const heapUsagePercentage = processMemory.heapUsed / processMemory.heapTotal;
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
                arrayBuffers: this.formatBytes(processMemory.arrayBuffers),
            },
            heapUsagePercentage,
        };
    }
    formatBytes(bytes) {
        return Math.round(bytes / (1024 * 1024));
    }
    getCurrentMemoryInfo() {
        return this.getMemoryInfo();
    }
    forceGarbageCollection() {
        if (globalThis.gc) {
            globalThis.gc();
            return true;
        }
        return false;
    }
};
exports.MemoryHealthIndicator = MemoryHealthIndicator;
exports.MemoryHealthIndicator = MemoryHealthIndicator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], MemoryHealthIndicator);
//# sourceMappingURL=memory-health.indicator.js.map