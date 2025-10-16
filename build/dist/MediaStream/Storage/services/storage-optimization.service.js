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
import { Cron, CronExpression } from "@nestjs/schedule";
import { StorageMonitoringService } from "./storage-monitoring.service.js";
export class StorageOptimizationService {
    async onModuleInit() {
        if (this.config.enabled) {
            this._logger.log(`Storage optimization enabled with strategies: ${this.config.strategies.join(', ')}`);
        } else {
            this._logger.log('Storage optimization disabled');
        }
    }
    /**
	 * Optimize frequently accessed files
	 */ async optimizeFrequentlyAccessedFiles() {
        if (this.isOptimizationRunning) {
            throw new Error('Optimization is already running');
        }
        const startTime = Date.now();
        this.isOptimizationRunning = true;
        try {
            CorrelatedLogger.log('Starting storage optimization for frequently accessed files', StorageOptimizationService.name);
            let stats;
            try {
                stats = await this.storageMonitoring.getStorageStats();
            } catch (error) {
                return {
                    filesOptimized: 0,
                    sizeReduced: 0,
                    errors: [
                        `Storage monitoring error: ${error.message}`
                    ],
                    strategy: 'none',
                    duration: Date.now() - startTime
                };
            }
            const popularFiles = stats.accessPatterns.filter((pattern)=>pattern.accessCount >= this.config.popularFileThreshold);
            if (popularFiles.length === 0) {
                return {
                    filesOptimized: 0,
                    sizeReduced: 0,
                    errors: [],
                    strategy: 'none',
                    duration: Date.now() - startTime
                };
            }
            let totalFilesOptimized = 0;
            let totalSizeReduced = 0;
            const allErrors = [];
            const appliedStrategies = [];
            for (const strategyName of this.config.strategies){
                const strategy = this.strategies.get(strategyName);
                if (!strategy) {
                    allErrors.push(`Unknown strategy: ${strategyName}`);
                    continue;
                }
                try {
                    const result = await strategy.execute(popularFiles);
                    totalFilesOptimized += result.filesOptimized;
                    totalSizeReduced += result.sizeReduced;
                    allErrors.push(...result.errors);
                    appliedStrategies.push(strategyName);
                    CorrelatedLogger.debug(`Strategy '${strategyName}': ${result.filesOptimized} files, ${this.formatBytes(result.sizeReduced)} saved`, StorageOptimizationService.name);
                } catch (error) {
                    const errorMsg = `Strategy '${strategyName}' failed: ${error.message}`;
                    allErrors.push(errorMsg);
                    CorrelatedLogger.error(errorMsg, error.stack, StorageOptimizationService.name);
                }
            }
            const result = {
                filesOptimized: totalFilesOptimized,
                sizeReduced: totalSizeReduced,
                errors: allErrors,
                strategy: appliedStrategies.join(', '),
                duration: Date.now() - startTime
            };
            CorrelatedLogger.log(`Optimization completed: ${totalFilesOptimized} files optimized, ${this.formatBytes(totalSizeReduced)} saved`, StorageOptimizationService.name);
            return result;
        } finally{
            this.isOptimizationRunning = false;
        }
    }
    /**
	 * Scheduled optimization
	 */ async scheduledOptimization() {
        if (!this.config.enabled || this.isOptimizationRunning) {
            return;
        }
        try {
            await this.optimizeFrequentlyAccessedFiles();
        } catch (error) {
            CorrelatedLogger.error(`Scheduled optimization failed: ${error.message}`, error.stack, StorageOptimizationService.name);
        }
    }
    /**
	 * Get optimization statistics
	 */ getOptimizationStats() {
        const optimizations = Array.from(this.optimizationHistory.values());
        const totalSizeSaved = optimizations.reduce((sum, opt)=>sum + (opt.originalSize - opt.optimizedSize), 0);
        const averageCompressionRatio = optimizations.length > 0 ? optimizations.reduce((sum, opt)=>sum + opt.compressionRatio, 0) / optimizations.length : 0;
        return {
            enabled: this.config.enabled,
            isRunning: this.isOptimizationRunning,
            totalOptimizations: optimizations.length,
            totalSizeSaved,
            averageCompressionRatio,
            strategies: this.config.strategies
        };
    }
    /**
	 * Get optimization history for a specific file
	 */ getFileOptimizationHistory(filename) {
        return this.optimizationHistory.get(filename) || null;
    }
    initializeStrategies() {
        this.strategies.set('compression', {
            name: 'Compression',
            description: 'Compress frequently accessed files using gzip',
            execute: async (files)=>{
                let filesOptimized = 0;
                let sizeReduced = 0;
                const errors = [];
                for (const file of files){
                    try {
                        const result = await this.compressFile(file);
                        if (result) {
                            filesOptimized++;
                            sizeReduced += result.originalSize - result.optimizedSize;
                            this.optimizationHistory.set(file.file, result);
                        }
                    } catch (error) {
                        errors.push(`Compression failed for ${file.file}: ${error.message}`);
                    }
                }
                return {
                    filesOptimized,
                    sizeReduced,
                    errors,
                    strategy: 'compression',
                    duration: 0
                };
            }
        });
        this.strategies.set('deduplication', {
            name: 'Deduplication',
            description: 'Remove duplicate files and create hard links',
            execute: async (files)=>{
                let filesOptimized = 0;
                let sizeReduced = 0;
                const errors = [];
                const duplicates = await this.findDuplicateFiles(files);
                for (const duplicateGroup of duplicates){
                    try {
                        const result = await this.deduplicateFiles(duplicateGroup);
                        filesOptimized += result.filesProcessed;
                        sizeReduced += result.sizeReduced;
                    } catch (error) {
                        errors.push(`Deduplication failed: ${error.message}`);
                    }
                }
                return {
                    filesOptimized,
                    sizeReduced,
                    errors,
                    strategy: 'deduplication',
                    duration: 0
                };
            }
        });
        this.strategies.set('prefetch', {
            name: 'Prefetch',
            description: 'Move frequently accessed files to faster storage tier',
            execute: async (files)=>{
                // This would move files to SSD or memory-mapped storage
                // For now, we'll just mark them as optimized
                return {
                    filesOptimized: files.length,
                    sizeReduced: 0,
                    errors: [],
                    strategy: 'prefetch',
                    duration: 0
                };
            }
        });
    }
    async compressFile(file) {
        const filePath = join(this.storageDirectory, file.file);
        const compressedPath = `${filePath}.gz`;
        if (file.extension === '.gz' || file.size < 1024) {
            return null;
        }
        try {
            const zlib = await import("node:zlib");
            const originalData = await fs.readFile(filePath);
            const compressedData = await new Promise((resolve, reject)=>{
                zlib.gzip(originalData, {
                    level: this.config.compressionLevel
                }, (err, result)=>{
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            const compressionRatio = compressedData.length / originalData.length;
            if (compressionRatio < 0.8) {
                if (this.config.createBackups) {
                    await fs.copyFile(filePath, `${filePath}.backup`);
                }
                await fs.writeFile(compressedPath, compressedData);
                await fs.unlink(filePath);
                return {
                    originalPath: filePath,
                    optimizedPath: compressedPath,
                    originalSize: originalData.length,
                    optimizedSize: compressedData.length,
                    compressionRatio,
                    strategy: 'compression'
                };
            }
        } catch (error) {
            CorrelatedLogger.warn(`Failed to compress ${file.file}: ${error.message}`, StorageOptimizationService.name);
            throw error;
        }
        return null;
    }
    async findDuplicateFiles(files) {
        const hashMap = new Map();
        const crypto = await import("node:crypto");
        for (const file of files){
            try {
                const filePath = join(this.storageDirectory, file.file);
                const data = await fs.readFile(filePath);
                const hash = crypto.createHash('md5').update(data).digest('hex');
                if (!hashMap.has(hash)) {
                    hashMap.set(hash, []);
                }
                hashMap.get(hash).push(file);
            } catch (error) {
                CorrelatedLogger.warn(`Failed to hash ${file.file}: ${error.message}`, StorageOptimizationService.name);
            }
        }
        return Array.from(hashMap.values()).filter((group)=>group.length > 1);
    }
    async deduplicateFiles(duplicateGroup) {
        if (duplicateGroup.length < 2) {
            return {
                filesProcessed: 0,
                sizeReduced: 0
            };
        }
        const sortedFiles = duplicateGroup.sort((a, b)=>b.accessCount - a.accessCount);
        const originalFile = sortedFiles[0];
        const duplicates = sortedFiles.slice(1);
        let filesProcessed = 0;
        let sizeReduced = 0;
        for (const duplicate of duplicates){
            try {
                const originalPath = join(this.storageDirectory, originalFile.file);
                const duplicatePath = join(this.storageDirectory, duplicate.file);
                await fs.unlink(duplicatePath);
                await fs.link(originalPath, duplicatePath);
                filesProcessed++;
                sizeReduced += duplicate.size;
            } catch (error) {
                CorrelatedLogger.warn(`Failed to deduplicate ${duplicate.file}: ${error.message}`, StorageOptimizationService.name);
            }
        }
        return {
            filesProcessed,
            sizeReduced
        };
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
    constructor(_configService, storageMonitoring){
        this._configService = _configService;
        this.storageMonitoring = storageMonitoring;
        this._logger = new Logger(StorageOptimizationService.name);
        this.strategies = new Map();
        this.optimizationHistory = new Map();
        this.isOptimizationRunning = false;
        this.storageDirectory = this._configService.getOptional('cache.file.directory', './storage');
        this.config = {
            enabled: this._configService.getOptional('storage.optimization.enabled', true),
            strategies: this._configService.getOptional('storage.optimization.strategies', [
                'compression',
                'deduplication'
            ]),
            popularFileThreshold: this._configService.getOptional('storage.optimization.popularThreshold', 10),
            compressionLevel: this._configService.getOptional('storage.optimization.compressionLevel', 6),
            createBackups: this._configService.getOptional('storage.optimization.createBackups', false),
            maxOptimizationTime: this._configService.getOptional('storage.optimization.maxTime', 600000)
        };
        this.initializeStrategies();
    }
}
_ts_decorate([
    Cron(CronExpression.EVERY_6_HOURS),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], StorageOptimizationService.prototype, "scheduledOptimization", null);
StorageOptimizationService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ConfigService === "undefined" ? Object : ConfigService,
        typeof StorageMonitoringService === "undefined" ? Object : StorageMonitoringService
    ])
], StorageOptimizationService);

//# sourceMappingURL=storage-optimization.service.js.map