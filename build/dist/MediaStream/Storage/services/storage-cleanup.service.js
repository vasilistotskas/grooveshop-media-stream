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
import { join } from "node:path";
import { ConfigService } from "../../Config/config.service.js";
import { CorrelatedLogger } from "../../Correlation/utils/logger.util.js";
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { IntelligentEvictionService } from "./intelligent-eviction.service.js";
import { StorageMonitoringService } from "./storage-monitoring.service.js";
export class StorageCleanupService {
    async onModuleInit() {
        if (this.config.enabled) {
            this._logger.log('Storage cleanup service initialized with policies:', this.config.policies.map((p)=>p.name));
        } else {
            this._logger.log('Storage cleanup service disabled');
        }
    }
    /**
	 * Perform manual cleanup with optional policy override
	 */ async performCleanup(policyNames, dryRun) {
        if (this.isCleanupRunning) {
            throw new Error('Cleanup is already running');
        }
        const startTime = Date.now();
        this.isCleanupRunning = true;
        try {
            CorrelatedLogger.log('Starting storage cleanup', StorageCleanupService.name);
            const policiesToApply = policyNames ? this.config.policies.filter((p)=>policyNames.includes(p.name)) : this.config.policies.filter((p)=>p.enabled);
            const isDryRun = dryRun ?? this.config.dryRun;
            let totalFilesRemoved = 0;
            let totalSizeFreed = 0;
            const allErrors = [];
            const appliedPolicies = [];
            for (const policy of policiesToApply){
                try {
                    const result = await this.applyRetentionPolicy(policy, isDryRun);
                    totalFilesRemoved += result.filesRemoved;
                    totalSizeFreed += result.sizeFreed;
                    allErrors.push(...result.errors);
                    appliedPolicies.push(policy.name);
                    CorrelatedLogger.debug(`Policy '${policy.name}': ${result.filesRemoved} files, ${this.formatBytes(result.sizeFreed)} freed`, StorageCleanupService.name);
                } catch (error) {
                    const errorMsg = `Policy '${policy.name}' failed: ${error.message}`;
                    allErrors.push(errorMsg);
                    CorrelatedLogger.error(errorMsg, error.stack, StorageCleanupService.name);
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
                } catch (error) {
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
                nextCleanup: this.getNextCleanupTime()
            };
            CorrelatedLogger.log(`Cleanup completed: ${totalFilesRemoved} files removed, ${this.formatBytes(totalSizeFreed)} freed`, StorageCleanupService.name);
            return result;
        } finally{
            this.isCleanupRunning = false;
        }
    }
    /**
	 * Scheduled cleanup based on cron configuration
	 */ async scheduledCleanup() {
        const currentlyEnabled = this._configService.getOptional('storage.cleanup.enabled', true);
        if (!currentlyEnabled || this.isCleanupRunning) {
            return;
        }
        try {
            await this.performCleanup();
        } catch (error) {
            CorrelatedLogger.error(`Scheduled cleanup failed: ${error.message}`, error.stack, StorageCleanupService.name);
        }
    }
    /**
	 * Get cleanup status and next scheduled run
	 */ getCleanupStatus() {
        return {
            enabled: this.config.enabled,
            isRunning: this.isCleanupRunning,
            lastCleanup: this.lastCleanup,
            nextCleanup: this.getNextCleanupTime(),
            policies: this.config.policies
        };
    }
    /**
	 * Add or update a retention policy
	 */ updateRetentionPolicy(policy) {
        const existingIndex = this.config.policies.findIndex((p)=>p.name === policy.name);
        if (existingIndex >= 0) {
            this.config.policies[existingIndex] = policy;
        } else {
            this.config.policies.push(policy);
        }
        CorrelatedLogger.log(`Retention policy '${policy.name}' updated`, StorageCleanupService.name);
    }
    /**
	 * Remove a retention policy
	 */ removeRetentionPolicy(policyName) {
        const index = this.config.policies.findIndex((p)=>p.name === policyName);
        if (index >= 0) {
            this.config.policies.splice(index, 1);
            CorrelatedLogger.log(`Retention policy '${policyName}' removed`, StorageCleanupService.name);
            return true;
        }
        return false;
    }
    async applyRetentionPolicy(policy, dryRun) {
        const files = await fs.readdir(this.storageDirectory);
        const candidates = [];
        for (const file of files){
            if (file === '.gitkeep') continue;
            const filePath = join(this.storageDirectory, file);
            const stats = await fs.stat(filePath);
            if (policy.filePattern && !policy.filePattern.test(file)) {
                continue;
            }
            const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
            if (ageInDays < policy.maxAge) {
                continue;
            }
            candidates.push({
                file,
                stats
            });
        }
        candidates.sort((a, b)=>a.stats.mtime.getTime() - b.stats.mtime.getTime());
        if (policy.preserveCount && candidates.length <= policy.preserveCount) {
            return {
                filesRemoved: 0,
                sizeFreed: 0,
                errors: []
            };
        }
        const filesToRemove = policy.preserveCount ? candidates.slice(0, candidates.length - policy.preserveCount) : candidates;
        let totalSize = 0;
        const finalCandidates = [];
        for (const candidate of filesToRemove){
            if (policy.maxSize > 0 && totalSize + candidate.stats.size > policy.maxSize) {
                break;
            }
            finalCandidates.push(candidate);
            totalSize += candidate.stats.size;
        }
        let filesRemoved = 0;
        let sizeFreed = 0;
        const errors = [];
        for (const { file, stats } of finalCandidates){
            try {
                if (!dryRun) {
                    const filePath = join(this.storageDirectory, file);
                    await fs.unlink(filePath);
                }
                filesRemoved++;
                sizeFreed += stats.size;
                CorrelatedLogger.debug(`${dryRun ? '[DRY RUN] ' : ''}Removed file: ${file} (${this.formatBytes(stats.size)})`, StorageCleanupService.name);
            } catch (error) {
                const errorMsg = `Failed to remove ${file}: ${error.message}`;
                errors.push(errorMsg);
                CorrelatedLogger.warn(errorMsg, StorageCleanupService.name);
            }
        }
        return {
            filesRemoved,
            sizeFreed,
            errors
        };
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
                enabled: true
            },
            {
                name: 'large-images',
                description: 'Remove large image files older than 7 days',
                maxAge: 7,
                maxSize: 100 * 1024 * 1024,
                filePattern: /\.(jpg|jpeg|png|webp|gif)$/,
                enabled: true
            },
            {
                name: 'temp-files',
                description: 'Remove temporary files older than 1 day',
                maxAge: 1,
                maxSize: 0,
                filePattern: /\.(tmp|temp)$/,
                enabled: true
            },
            {
                name: 'preserve-recent',
                description: 'Keep at least 100 most recent files',
                maxAge: 0,
                maxSize: 0,
                preserveCount: 100,
                enabled: true
            }
        ];
        return {
            enabled,
            cronSchedule,
            policies: defaultPolicies,
            dryRun,
            maxCleanupDuration
        };
    }
    getNextCleanupTime() {
        const nextCleanup = new Date(this.lastCleanup);
        nextCleanup.setDate(nextCleanup.getDate() + 1);
        nextCleanup.setHours(2, 0, 0, 0);
        return nextCleanup;
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
    constructor(_configService, storageMonitoring, intelligentEviction){
        this._configService = _configService;
        this.storageMonitoring = storageMonitoring;
        this.intelligentEviction = intelligentEviction;
        this._logger = new Logger(StorageCleanupService.name);
        this.lastCleanup = new Date();
        this.isCleanupRunning = false;
        this.storageDirectory = this._configService.getOptional('cache.file.directory', './storage');
        this.config = this.loadCleanupConfig();
    }
}
_ts_decorate([
    Cron('0 2 * * *'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], StorageCleanupService.prototype, "scheduledCleanup", null);
StorageCleanupService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ConfigService === "undefined" ? Object : ConfigService,
        typeof StorageMonitoringService === "undefined" ? Object : StorageMonitoringService,
        typeof IntelligentEvictionService === "undefined" ? Object : IntelligentEvictionService
    ])
], StorageCleanupService);

//# sourceMappingURL=storage-cleanup.service.js.map