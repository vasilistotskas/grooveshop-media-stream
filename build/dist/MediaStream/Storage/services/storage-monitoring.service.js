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
import { extname, join } from "node:path";
import { ConfigService } from "../../Config/config.service.js";
import { CorrelatedLogger } from "../../Correlation/utils/logger.util.js";
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
export class StorageMonitoringService {
    async onModuleInit() {
        await this.ensureStorageDirectory();
        await this.scanStorageDirectory();
        this._logger.log('Storage monitoring service initialized');
    }
    /**
	 * Get current storage statistics
	 */ async getStorageStats() {
        try {
            const files = await fs.readdir(this.storageDirectory);
            let totalSize = 0;
            let processedFileCount = 0;
            let oldestFile = null;
            let newestFile = null;
            const fileTypes = {};
            for (const file of files){
                if (file === '.gitkeep') continue;
                const filePath = join(this.storageDirectory, file);
                const stats = await fs.stat(filePath);
                totalSize += stats.size;
                processedFileCount++;
                if (!oldestFile || stats.mtime < oldestFile) {
                    oldestFile = stats.mtime;
                }
                if (!newestFile || stats.mtime > newestFile) {
                    newestFile = stats.mtime;
                }
                const ext = extname(file).toLowerCase();
                fileTypes[ext] = (fileTypes[ext] || 0) + 1;
                this.updateAccessPattern(file, stats);
            }
            const averageFileSize = processedFileCount > 0 ? totalSize / processedFileCount : 0;
            return {
                totalFiles: processedFileCount,
                totalSize,
                averageFileSize,
                oldestFile,
                newestFile,
                fileTypes,
                accessPatterns: Array.from(this.accessPatterns.values()).sort((a, b)=>b.accessCount - a.accessCount).slice(0, 100)
            };
        } catch (error) {
            CorrelatedLogger.error(`Failed to get storage stats: ${error.message}`, error.stack, StorageMonitoringService.name);
            throw error;
        }
    }
    /**
	 * Check if storage exceeds thresholds
	 */ async checkThresholds() {
        const stats = await this.getStorageStats();
        const issues = [];
        let status = 'healthy';
        if (stats.totalSize >= this.thresholds.criticalSize) {
            status = 'critical';
            issues.push(`Storage size critical: ${this.formatBytes(stats.totalSize)} / ${this.formatBytes(this.thresholds.criticalSize)}`);
        } else if (stats.totalSize >= this.thresholds.warningSize) {
            status = 'warning';
            issues.push(`Storage size warning: ${this.formatBytes(stats.totalSize)} / ${this.formatBytes(this.thresholds.warningSize)}`);
        }
        if (stats.totalFiles >= this.thresholds.criticalFileCount) {
            status = 'critical';
            issues.push(`File count critical: ${stats.totalFiles} / ${this.thresholds.criticalFileCount}`);
        } else if (stats.totalFiles >= this.thresholds.warningFileCount) {
            if (status !== 'critical') status = 'warning';
            issues.push(`File count warning: ${stats.totalFiles} / ${this.thresholds.warningFileCount}`);
        }
        const maxAge = this.thresholds.maxFileAge * 24 * 60 * 60 * 1000;
        const cutoffDate = new Date(Date.now() - maxAge);
        const oldFiles = stats.accessPatterns.filter((pattern)=>pattern.lastAccessed < cutoffDate);
        if (oldFiles.length > 0) {
            if (status !== 'critical') status = 'warning';
            issues.push(`${oldFiles.length} files older than ${this.thresholds.maxFileAge} days`);
        }
        return {
            status,
            issues,
            stats
        };
    }
    /**
	 * Get files recommended for eviction based on access patterns
	 */ async getEvictionCandidates(targetSize) {
        const stats = await this.getStorageStats();
        const defaultTarget = Math.floor(stats.totalSize * 0.2);
        const target = targetSize || defaultTarget;
        const candidates = stats.accessPatterns.map((pattern)=>({
                ...pattern,
                score: this.calculateEvictionScore(pattern)
            })).sort((a, b)=>a.score - b.score);
        const selected = [];
        let freedSize = 0;
        for (const candidate of candidates){
            selected.push(candidate);
            freedSize += candidate.size;
            if (freedSize >= target) {
                break;
            }
        }
        return selected;
    }
    /**
	 * Record file access for tracking patterns
	 */ recordFileAccess(filename) {
        const pattern = this.accessPatterns.get(filename);
        if (pattern) {
            pattern.accessCount++;
            pattern.lastAccessed = new Date();
        }
    }
    /**
	 * Scan storage directory and update access patterns
	 */ async scanStorageDirectory() {
        try {
            CorrelatedLogger.debug('Starting storage directory scan', StorageMonitoringService.name);
            const files = await fs.readdir(this.storageDirectory);
            const currentFiles = new Set();
            for (const file of files){
                if (file === '.gitkeep') continue;
                currentFiles.add(file);
                const filePath = join(this.storageDirectory, file);
                const stats = await fs.stat(filePath);
                this.updateAccessPattern(file, stats);
            }
            for (const [filename] of this.accessPatterns){
                if (!currentFiles.has(filename)) {
                    this.accessPatterns.delete(filename);
                }
            }
            this.lastScanTime = new Date();
            CorrelatedLogger.debug(`Storage scan completed. Tracking ${this.accessPatterns.size} files`, StorageMonitoringService.name);
        } catch (error) {
            CorrelatedLogger.error(`Storage directory scan failed: ${error.message}`, error.stack, StorageMonitoringService.name);
        }
    }
    /**
	 * Get the last scan time
	 */ getLastScanTime() {
        return this.lastScanTime;
    }
    updateAccessPattern(filename, stats) {
        const existing = this.accessPatterns.get(filename);
        if (existing) {
            existing.size = stats.size;
        } else {
            this.accessPatterns.set(filename, {
                file: filename,
                lastAccessed: stats.atime,
                accessCount: 1,
                size: stats.size,
                extension: extname(filename).toLowerCase()
            });
        }
    }
    calculateEvictionScore(pattern) {
        const now = Date.now();
        const ageInDays = (now - pattern.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
        const sizeWeight = pattern.size / (1024 * 1024);
        const ageScore = Math.min(ageInDays * 10, 1000);
        const accessScore = Math.max(1000 - pattern.accessCount * 10, 0);
        const sizeScore = Math.min(sizeWeight, 100);
        return ageScore + accessScore + sizeScore;
    }
    formatBytes(bytes) {
        const units = [
            'B',
            'KB',
            'MB',
            'GB'
        ];
        let size = bytes;
        let unitIndex = 0;
        while(size >= 1024 && unitIndex < units.length - 1){
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
    async ensureStorageDirectory() {
        try {
            await fs.mkdir(this.storageDirectory, {
                recursive: true
            });
        } catch (error) {
            CorrelatedLogger.error(`Failed to create storage directory: ${error.message}`, error.stack, StorageMonitoringService.name);
            throw error;
        }
    }
    constructor(_configService){
        this._configService = _configService;
        this._logger = new Logger(StorageMonitoringService.name);
        this.accessPatterns = new Map();
        this.lastScanTime = new Date();
        this.storageDirectory = this._configService.getOptional('cache.file.directory', './storage');
        this.thresholds = {
            warningSize: this._configService.getOptional('storage.warningSize', 800 * 1024 * 1024),
            criticalSize: this._configService.getOptional('storage.criticalSize', 1024 * 1024 * 1024),
            warningFileCount: this._configService.getOptional('storage.warningFileCount', 5000),
            criticalFileCount: this._configService.getOptional('storage.criticalFileCount', 10000),
            maxFileAge: this._configService.getOptional('storage.maxFileAge', 30)
        };
    }
}
_ts_decorate([
    Cron(CronExpression.EVERY_HOUR),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], StorageMonitoringService.prototype, "scanStorageDirectory", null);
StorageMonitoringService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ConfigService === "undefined" ? Object : ConfigService
    ])
], StorageMonitoringService);

//# sourceMappingURL=storage-monitoring.service.js.map