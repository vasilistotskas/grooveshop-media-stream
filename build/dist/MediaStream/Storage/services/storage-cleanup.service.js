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
var StorageCleanupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageCleanupService = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const config_service_1 = require("../../Config/config.service");
const logger_util_1 = require("../../Correlation/utils/logger.util");
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const intelligent_eviction_service_1 = require("./intelligent-eviction.service");
const storage_monitoring_service_1 = require("./storage-monitoring.service");
let StorageCleanupService = StorageCleanupService_1 = class StorageCleanupService {
    constructor(_configService, storageMonitoring, intelligentEviction) {
        this._configService = _configService;
        this.storageMonitoring = storageMonitoring;
        this.intelligentEviction = intelligentEviction;
        this._logger = new common_1.Logger(StorageCleanupService_1.name);
        this.lastCleanup = new Date();
        this.isCleanupRunning = false;
        this.storageDirectory = this._configService.getOptional('cache.file.directory', './storage');
        this.config = this.loadCleanupConfig();
    }
    async onModuleInit() {
        if (this.config.enabled) {
            this._logger.log('Storage cleanup service initialized with policies:', this.config.policies.map(p => p.name));
        }
        else {
            this._logger.log('Storage cleanup service disabled');
        }
    }
    async performCleanup(policyNames, dryRun) {
        if (this.isCleanupRunning) {
            throw new Error('Cleanup is already running');
        }
        const startTime = Date.now();
        this.isCleanupRunning = true;
        try {
            logger_util_1.CorrelatedLogger.log('Starting storage cleanup', StorageCleanupService_1.name);
            const policiesToApply = policyNames
                ? this.config.policies.filter(p => policyNames.includes(p.name))
                : this.config.policies.filter(p => p.enabled);
            const isDryRun = dryRun ?? this.config.dryRun;
            let totalFilesRemoved = 0;
            let totalSizeFreed = 0;
            const allErrors = [];
            const appliedPolicies = [];
            for (const policy of policiesToApply) {
                try {
                    const result = await this.applyRetentionPolicy(policy, isDryRun);
                    totalFilesRemoved += result.filesRemoved;
                    totalSizeFreed += result.sizeFreed;
                    allErrors.push(...result.errors);
                    appliedPolicies.push(policy.name);
                    logger_util_1.CorrelatedLogger.debug(`Policy '${policy.name}': ${result.filesRemoved} files, ${this.formatBytes(result.sizeFreed)} freed`, StorageCleanupService_1.name);
                }
                catch (error) {
                    const errorMsg = `Policy '${policy.name}' failed: ${error.message}`;
                    allErrors.push(errorMsg);
                    logger_util_1.CorrelatedLogger.error(errorMsg, error.stack, StorageCleanupService_1.name);
                }
            }
            const thresholdCheck = await this.storageMonitoring.checkThresholds();
            if (thresholdCheck.status !== 'healthy' && !isDryRun) {
                try {
                    const evictionResult = await this.intelligentEviction.performThresholdBasedEviction();
                    totalFilesRemoved += evictionResult.filesEvicted;
                    totalSizeFreed += evictionResult.sizeFreed;
                    allErrors.push(...evictionResult.errors);
                    appliedPolicies.push('intelligent-eviction');
                }
                catch (error) {
                    allErrors.push(`Intelligent eviction failed: ${error.message}`);
                }
            }
            this.lastCleanup = new Date();
            const duration = Date.now() - startTime;
            const result = {
                filesRemoved: totalFilesRemoved,
                sizeFreed: totalSizeFreed,
                errors: allErrors,
                policiesApplied: appliedPolicies,
                duration,
                nextCleanup: this.getNextCleanupTime(),
            };
            logger_util_1.CorrelatedLogger.log(`Cleanup completed: ${totalFilesRemoved} files removed, ${this.formatBytes(totalSizeFreed)} freed`, StorageCleanupService_1.name);
            return result;
        }
        finally {
            this.isCleanupRunning = false;
        }
    }
    async scheduledCleanup() {
        const currentlyEnabled = this._configService.getOptional('storage.cleanup.enabled', true);
        if (!currentlyEnabled || this.isCleanupRunning) {
            return;
        }
        try {
            await this.performCleanup();
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Scheduled cleanup failed: ${error.message}`, error.stack, StorageCleanupService_1.name);
        }
    }
    getCleanupStatus() {
        return {
            enabled: this.config.enabled,
            isRunning: this.isCleanupRunning,
            lastCleanup: this.lastCleanup,
            nextCleanup: this.getNextCleanupTime(),
            policies: this.config.policies,
        };
    }
    updateRetentionPolicy(policy) {
        const existingIndex = this.config.policies.findIndex(p => p.name === policy.name);
        if (existingIndex >= 0) {
            this.config.policies[existingIndex] = policy;
        }
        else {
            this.config.policies.push(policy);
        }
        logger_util_1.CorrelatedLogger.log(`Retention policy '${policy.name}' updated`, StorageCleanupService_1.name);
    }
    removeRetentionPolicy(policyName) {
        const index = this.config.policies.findIndex(p => p.name === policyName);
        if (index >= 0) {
            this.config.policies.splice(index, 1);
            logger_util_1.CorrelatedLogger.log(`Retention policy '${policyName}' removed`, StorageCleanupService_1.name);
            return true;
        }
        return false;
    }
    async applyRetentionPolicy(policy, dryRun) {
        const files = await node_fs_1.promises.readdir(this.storageDirectory);
        const candidates = [];
        for (const file of files) {
            if (file === '.gitkeep')
                continue;
            const filePath = (0, node_path_1.join)(this.storageDirectory, file);
            const stats = await node_fs_1.promises.stat(filePath);
            if (policy.filePattern && !policy.filePattern.test(file)) {
                continue;
            }
            const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
            if (ageInDays < policy.maxAge) {
                continue;
            }
            candidates.push({ file, stats });
        }
        candidates.sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime());
        if (policy.preserveCount && candidates.length <= policy.preserveCount) {
            return { filesRemoved: 0, sizeFreed: 0, errors: [] };
        }
        const filesToRemove = policy.preserveCount
            ? candidates.slice(0, candidates.length - policy.preserveCount)
            : candidates;
        let totalSize = 0;
        const finalCandidates = [];
        for (const candidate of filesToRemove) {
            if (policy.maxSize > 0 && totalSize + candidate.stats.size > policy.maxSize) {
                break;
            }
            finalCandidates.push(candidate);
            totalSize += candidate.stats.size;
        }
        let filesRemoved = 0;
        let sizeFreed = 0;
        const errors = [];
        for (const { file, stats } of finalCandidates) {
            try {
                if (!dryRun) {
                    const filePath = (0, node_path_1.join)(this.storageDirectory, file);
                    await node_fs_1.promises.unlink(filePath);
                }
                filesRemoved++;
                sizeFreed += stats.size;
                logger_util_1.CorrelatedLogger.debug(`${dryRun ? '[DRY RUN] ' : ''}Removed file: ${file} (${this.formatBytes(stats.size)})`, StorageCleanupService_1.name);
            }
            catch (error) {
                const errorMsg = `Failed to remove ${file}: ${error.message}`;
                errors.push(errorMsg);
                logger_util_1.CorrelatedLogger.warn(errorMsg, StorageCleanupService_1.name);
            }
        }
        return { filesRemoved, sizeFreed, errors };
    }
    loadCleanupConfig() {
        const enabled = this._configService.getOptional('storage.cleanup.enabled', true);
        const cronSchedule = this._configService.getOptional('storage.cleanup.cronSchedule', '0 2 * * *');
        const dryRun = this._configService.getOptional('storage.cleanup.dryRun', false);
        const maxCleanupDuration = this._configService.getOptional('storage.cleanup.maxDuration', 300000);
        const defaultPolicies = [
            {
                name: 'old-cache-files',
                description: 'Remove cache files older than 30 days',
                maxAge: 30,
                maxSize: 0,
                filePattern: /\.(json|cache)$/,
                enabled: true,
            },
            {
                name: 'large-images',
                description: 'Remove large image files older than 7 days',
                maxAge: 7,
                maxSize: 100 * 1024 * 1024,
                filePattern: /\.(jpg|jpeg|png|webp|gif)$/,
                enabled: true,
            },
            {
                name: 'temp-files',
                description: 'Remove temporary files older than 1 day',
                maxAge: 1,
                maxSize: 0,
                filePattern: /\.(tmp|temp)$/,
                enabled: true,
            },
            {
                name: 'preserve-recent',
                description: 'Keep at least 100 most recent files',
                maxAge: 0,
                maxSize: 0,
                preserveCount: 100,
                enabled: true,
            },
        ];
        return {
            enabled,
            cronSchedule,
            policies: defaultPolicies,
            dryRun,
            maxCleanupDuration,
        };
    }
    getNextCleanupTime() {
        const nextCleanup = new Date(this.lastCleanup);
        nextCleanup.setDate(nextCleanup.getDate() + 1);
        nextCleanup.setHours(2, 0, 0, 0);
        return nextCleanup;
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
exports.StorageCleanupService = StorageCleanupService;
__decorate([
    (0, schedule_1.Cron)('0 2 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StorageCleanupService.prototype, "scheduledCleanup", null);
exports.StorageCleanupService = StorageCleanupService = StorageCleanupService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService,
        storage_monitoring_service_1.StorageMonitoringService,
        intelligent_eviction_service_1.IntelligentEvictionService])
], StorageCleanupService);
//# sourceMappingURL=storage-cleanup.service.js.map