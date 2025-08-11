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
exports.StorageHealthIndicator = void 0;
const config_service_1 = require("../../Config/config.service");
const base_health_indicator_1 = require("../../Health/base/base-health-indicator");
const common_1 = require("@nestjs/common");
const storage_cleanup_service_1 = require("../services/storage-cleanup.service");
const storage_monitoring_service_1 = require("../services/storage-monitoring.service");
let StorageHealthIndicator = class StorageHealthIndicator extends base_health_indicator_1.BaseHealthIndicator {
    constructor(_configService, storageMonitoring, storageCleanup) {
        const options = {
            timeout: 5000,
            threshold: 0.9,
        };
        super('storage', options);
        this._configService = _configService;
        this.storageMonitoring = storageMonitoring;
        this.storageCleanup = storageCleanup;
        this._warningThreshold = this._configService.getOptional('storage.health.warningThreshold', 0.8);
        this._criticalThreshold = this._configService.getOptional('storage.health.criticalThreshold', 0.9);
    }
    async performHealthCheck() {
        return this.executeWithTimeout(async () => {
            const thresholdCheck = await this.storageMonitoring.checkThresholds();
            const stats = thresholdCheck.stats;
            const cleanupStatus = this.storageCleanup.getCleanupStatus();
            const maxSize = this._configService.getOptional('storage.maxSize', 1024 * 1024 * 1024);
            const usagePercentage = stats.totalSize / maxSize;
            const recommendations = this.generateRecommendations(thresholdCheck, cleanupStatus);
            const details = {
                totalFiles: stats.totalFiles,
                totalSize: this.formatBytes(stats.totalSize),
                usagePercentage: Math.round(usagePercentage * 100),
                oldestFile: stats.oldestFile ? stats.oldestFile.toISOString() : null,
                newestFile: stats.newestFile ? stats.newestFile.toISOString() : null,
                topFileTypes: Object.entries(stats.fileTypes)
                    .map(([extension, count]) => ({ extension, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5),
                cleanupStatus: {
                    enabled: cleanupStatus.enabled,
                    lastCleanup: cleanupStatus.lastCleanup.toISOString(),
                    nextCleanup: cleanupStatus.nextCleanup.toISOString(),
                },
                thresholds: {
                    warningSize: this.formatBytes(this._configService.getOptional('storage.warningSize', 800 * 1024 * 1024)),
                    criticalSize: this.formatBytes(this._configService.getOptional('storage.criticalSize', 1024 * 1024 * 1024)),
                    warningFileCount: this._configService.getOptional('storage.warningFileCount', 5000),
                    criticalFileCount: this._configService.getOptional('storage.criticalFileCount', 10000),
                },
                recommendations,
            };
            if (thresholdCheck.status === 'critical') {
                return this.createUnhealthyResult(`Storage in critical state: ${thresholdCheck.issues.join(', ')}`, details);
            }
            if (thresholdCheck.status === 'warning') {
                return this.createHealthyResult({
                    ...details,
                    detailStatus: 'warning',
                    warnings: thresholdCheck.issues,
                });
            }
            return this.createHealthyResult(details);
        });
    }
    getDescription() {
        return 'Monitors storage usage, file patterns, and cleanup status with intelligent recommendations';
    }
    async getStorageAnalysis() {
        const stats = await this.storageMonitoring.getStorageStats();
        const thresholdCheck = await this.storageMonitoring.checkThresholds();
        const evictionRecommendations = await this.storageMonitoring.getEvictionCandidates();
        return {
            stats,
            thresholds: thresholdCheck,
            evictionCandidates: evictionRecommendations.slice(0, 10),
            cleanupRecommendations: this.generateCleanupRecommendations(stats, thresholdCheck),
        };
    }
    generateRecommendations(thresholdCheck, cleanupStatus) {
        const recommendations = [];
        if (thresholdCheck.status === 'critical') {
            recommendations.push('URGENT: Run immediate cleanup to free storage space');
            recommendations.push('Consider increasing storage capacity or reducing retention periods');
        }
        else if (thresholdCheck.status === 'warning') {
            recommendations.push('Schedule cleanup soon to prevent storage issues');
            recommendations.push('Review retention policies for optimization');
        }
        if (!cleanupStatus.enabled) {
            recommendations.push('Enable automatic cleanup to maintain storage health');
        }
        else {
            const timeSinceLastCleanup = Date.now() - cleanupStatus.lastCleanup.getTime();
            const daysSinceCleanup = timeSinceLastCleanup / (1000 * 60 * 60 * 24);
            if (daysSinceCleanup > 7) {
                recommendations.push('Last cleanup was over a week ago - consider running manual cleanup');
            }
        }
        if (thresholdCheck.stats.fileTypes['.json'] > 1000) {
            recommendations.push('High number of JSON cache files - consider shorter TTL for cache entries');
        }
        if (thresholdCheck.stats.fileTypes['.webp'] > 500) {
            recommendations.push('Many WebP files stored - ensure image optimization is working correctly');
        }
        const lowAccessFiles = thresholdCheck.stats.accessPatterns.filter(p => p.accessCount < 2).length;
        if (lowAccessFiles > thresholdCheck.stats.totalFiles * 0.5) {
            recommendations.push('Over 50% of files have low access counts - consider more aggressive eviction');
        }
        return recommendations;
    }
    generateCleanupRecommendations(stats, _thresholdCheck) {
        const recommendations = [];
        const oldFiles = stats.accessPatterns.filter((p) => {
            const ageInDays = (Date.now() - p.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
            return ageInDays > 30;
        });
        if (oldFiles.length > 0) {
            const totalOldSize = oldFiles.reduce((sum, f) => sum + f.size, 0);
            recommendations.push(`${oldFiles.length} files older than 30 days (${this.formatBytes(totalOldSize)})`);
        }
        const largeFiles = stats.accessPatterns
            .filter(p => p.size > 1024 * 1024)
            .sort((a, b) => b.size - a.size)
            .slice(0, 10);
        if (largeFiles.length > 0) {
            recommendations.push(`Top large files: ${largeFiles.map(f => `${f.file} (${this.formatBytes(f.size)})`).join(', ')}`);
        }
        const neverAccessedFiles = stats.accessPatterns.filter(p => p.accessCount === 1);
        if (neverAccessedFiles.length > 0) {
            const totalNeverAccessedSize = neverAccessedFiles.reduce((sum, f) => sum + f.size, 0);
            recommendations.push(`${neverAccessedFiles.length} files accessed only once (${this.formatBytes(totalNeverAccessedSize)})`);
        }
        return recommendations;
    }
    formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
};
exports.StorageHealthIndicator = StorageHealthIndicator;
exports.StorageHealthIndicator = StorageHealthIndicator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService,
        storage_monitoring_service_1.StorageMonitoringService,
        storage_cleanup_service_1.StorageCleanupService])
], StorageHealthIndicator);
//# sourceMappingURL=storage-health.indicator.js.map