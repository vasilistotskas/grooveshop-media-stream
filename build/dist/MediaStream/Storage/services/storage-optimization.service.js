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
var StorageOptimizationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageOptimizationService = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const config_service_1 = require("../../Config/config.service");
const logger_util_1 = require("../../Correlation/utils/logger.util");
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const storage_monitoring_service_1 = require("./storage-monitoring.service");
let StorageOptimizationService = StorageOptimizationService_1 = class StorageOptimizationService {
    constructor(configService, storageMonitoring) {
        this.configService = configService;
        this.storageMonitoring = storageMonitoring;
        this.logger = new common_1.Logger(StorageOptimizationService_1.name);
        this.strategies = new Map();
        this.optimizationHistory = new Map();
        this.isOptimizationRunning = false;
        this.storageDirectory = this.configService.getOptional('cache.file.directory', './storage');
        this.config = {
            enabled: this.configService.getOptional('storage.optimization.enabled', true),
            strategies: this.configService.getOptional('storage.optimization.strategies', ['compression', 'deduplication']),
            popularFileThreshold: this.configService.getOptional('storage.optimization.popularThreshold', 10),
            compressionLevel: this.configService.getOptional('storage.optimization.compressionLevel', 6),
            createBackups: this.configService.getOptional('storage.optimization.createBackups', false),
            maxOptimizationTime: this.configService.getOptional('storage.optimization.maxTime', 600000),
        };
        this.initializeStrategies();
    }
    async onModuleInit() {
        if (this.config.enabled) {
            this.logger.log(`Storage optimization enabled with strategies: ${this.config.strategies.join(', ')}`);
        }
        else {
            this.logger.log('Storage optimization disabled');
        }
    }
    async optimizeFrequentlyAccessedFiles() {
        if (this.isOptimizationRunning) {
            throw new Error('Optimization is already running');
        }
        const startTime = Date.now();
        this.isOptimizationRunning = true;
        try {
            logger_util_1.CorrelatedLogger.log('Starting storage optimization for frequently accessed files', StorageOptimizationService_1.name);
            let stats;
            try {
                stats = await this.storageMonitoring.getStorageStats();
            }
            catch (error) {
                return {
                    filesOptimized: 0,
                    sizeReduced: 0,
                    errors: [`Storage monitoring error: ${error.message}`],
                    strategy: 'none',
                    duration: Date.now() - startTime,
                };
            }
            const popularFiles = stats.accessPatterns.filter(pattern => pattern.accessCount >= this.config.popularFileThreshold);
            if (popularFiles.length === 0) {
                return {
                    filesOptimized: 0,
                    sizeReduced: 0,
                    errors: [],
                    strategy: 'none',
                    duration: Date.now() - startTime,
                };
            }
            let totalFilesOptimized = 0;
            let totalSizeReduced = 0;
            const allErrors = [];
            const appliedStrategies = [];
            for (const strategyName of this.config.strategies) {
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
                    logger_util_1.CorrelatedLogger.debug(`Strategy '${strategyName}': ${result.filesOptimized} files, ${this.formatBytes(result.sizeReduced)} saved`, StorageOptimizationService_1.name);
                }
                catch (error) {
                    const errorMsg = `Strategy '${strategyName}' failed: ${error.message}`;
                    allErrors.push(errorMsg);
                    logger_util_1.CorrelatedLogger.error(errorMsg, error.stack, StorageOptimizationService_1.name);
                }
            }
            const result = {
                filesOptimized: totalFilesOptimized,
                sizeReduced: totalSizeReduced,
                errors: allErrors,
                strategy: appliedStrategies.join(', '),
                duration: Date.now() - startTime,
            };
            logger_util_1.CorrelatedLogger.log(`Optimization completed: ${totalFilesOptimized} files optimized, ${this.formatBytes(totalSizeReduced)} saved`, StorageOptimizationService_1.name);
            return result;
        }
        finally {
            this.isOptimizationRunning = false;
        }
    }
    async scheduledOptimization() {
        if (!this.config.enabled || this.isOptimizationRunning) {
            return;
        }
        try {
            await this.optimizeFrequentlyAccessedFiles();
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Scheduled optimization failed: ${error.message}`, error.stack, StorageOptimizationService_1.name);
        }
    }
    getOptimizationStats() {
        const optimizations = Array.from(this.optimizationHistory.values());
        const totalSizeSaved = optimizations.reduce((sum, opt) => sum + (opt.originalSize - opt.optimizedSize), 0);
        const averageCompressionRatio = optimizations.length > 0
            ? optimizations.reduce((sum, opt) => sum + opt.compressionRatio, 0) / optimizations.length
            : 0;
        return {
            enabled: this.config.enabled,
            isRunning: this.isOptimizationRunning,
            totalOptimizations: optimizations.length,
            totalSizeSaved,
            averageCompressionRatio,
            strategies: this.config.strategies,
        };
    }
    getFileOptimizationHistory(filename) {
        return this.optimizationHistory.get(filename) || null;
    }
    initializeStrategies() {
        this.strategies.set('compression', {
            name: 'Compression',
            description: 'Compress frequently accessed files using gzip',
            execute: async (files) => {
                let filesOptimized = 0;
                let sizeReduced = 0;
                const errors = [];
                for (const file of files) {
                    try {
                        const result = await this.compressFile(file);
                        if (result) {
                            filesOptimized++;
                            sizeReduced += result.originalSize - result.optimizedSize;
                            this.optimizationHistory.set(file.file, result);
                        }
                    }
                    catch (error) {
                        errors.push(`Compression failed for ${file.file}: ${error.message}`);
                    }
                }
                return {
                    filesOptimized,
                    sizeReduced,
                    errors,
                    strategy: 'compression',
                    duration: 0,
                };
            },
        });
        this.strategies.set('deduplication', {
            name: 'Deduplication',
            description: 'Remove duplicate files and create hard links',
            execute: async (files) => {
                let filesOptimized = 0;
                let sizeReduced = 0;
                const errors = [];
                const duplicates = await this.findDuplicateFiles(files);
                for (const duplicateGroup of duplicates) {
                    try {
                        const result = await this.deduplicateFiles(duplicateGroup);
                        filesOptimized += result.filesProcessed;
                        sizeReduced += result.sizeReduced;
                    }
                    catch (error) {
                        errors.push(`Deduplication failed: ${error.message}`);
                    }
                }
                return {
                    filesOptimized,
                    sizeReduced,
                    errors,
                    strategy: 'deduplication',
                    duration: 0,
                };
            },
        });
        this.strategies.set('prefetch', {
            name: 'Prefetch',
            description: 'Move frequently accessed files to faster storage tier',
            execute: async (files) => {
                return {
                    filesOptimized: files.length,
                    sizeReduced: 0,
                    errors: [],
                    strategy: 'prefetch',
                    duration: 0,
                };
            },
        });
    }
    async compressFile(file) {
        const filePath = (0, node_path_1.join)(this.storageDirectory, file.file);
        const compressedPath = `${filePath}.gz`;
        if (file.extension === '.gz' || file.size < 1024) {
            return null;
        }
        try {
            const zlib = await Promise.resolve().then(() => __importStar(require('node:zlib')));
            const originalData = await node_fs_1.promises.readFile(filePath);
            const compressedData = await new Promise((resolve, reject) => {
                zlib.gzip(originalData, { level: this.config.compressionLevel }, (err, result) => {
                    if (err)
                        reject(err);
                    else
                        resolve(result);
                });
            });
            const compressionRatio = compressedData.length / originalData.length;
            if (compressionRatio < 0.8) {
                if (this.config.createBackups) {
                    await node_fs_1.promises.copyFile(filePath, `${filePath}.backup`);
                }
                await node_fs_1.promises.writeFile(compressedPath, compressedData);
                await node_fs_1.promises.unlink(filePath);
                return {
                    originalPath: filePath,
                    optimizedPath: compressedPath,
                    originalSize: originalData.length,
                    optimizedSize: compressedData.length,
                    compressionRatio,
                    strategy: 'compression',
                };
            }
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.warn(`Failed to compress ${file.file}: ${error.message}`, StorageOptimizationService_1.name);
            throw error;
        }
        return null;
    }
    async findDuplicateFiles(files) {
        const hashMap = new Map();
        const crypto = await Promise.resolve().then(() => __importStar(require('node:crypto')));
        for (const file of files) {
            try {
                const filePath = (0, node_path_1.join)(this.storageDirectory, file.file);
                const data = await node_fs_1.promises.readFile(filePath);
                const hash = crypto.createHash('md5').update(data).digest('hex');
                if (!hashMap.has(hash)) {
                    hashMap.set(hash, []);
                }
                hashMap.get(hash).push(file);
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Failed to hash ${file.file}: ${error.message}`, StorageOptimizationService_1.name);
            }
        }
        return Array.from(hashMap.values()).filter(group => group.length > 1);
    }
    async deduplicateFiles(duplicateGroup) {
        if (duplicateGroup.length < 2) {
            return { filesProcessed: 0, sizeReduced: 0 };
        }
        const sortedFiles = duplicateGroup.sort((a, b) => b.accessCount - a.accessCount);
        const originalFile = sortedFiles[0];
        const duplicates = sortedFiles.slice(1);
        let filesProcessed = 0;
        let sizeReduced = 0;
        for (const duplicate of duplicates) {
            try {
                const originalPath = (0, node_path_1.join)(this.storageDirectory, originalFile.file);
                const duplicatePath = (0, node_path_1.join)(this.storageDirectory, duplicate.file);
                await node_fs_1.promises.unlink(duplicatePath);
                await node_fs_1.promises.link(originalPath, duplicatePath);
                filesProcessed++;
                sizeReduced += duplicate.size;
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Failed to deduplicate ${duplicate.file}: ${error.message}`, StorageOptimizationService_1.name);
            }
        }
        return { filesProcessed, sizeReduced };
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
exports.StorageOptimizationService = StorageOptimizationService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_6_HOURS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StorageOptimizationService.prototype, "scheduledOptimization", null);
exports.StorageOptimizationService = StorageOptimizationService = StorageOptimizationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService,
        storage_monitoring_service_1.StorageMonitoringService])
], StorageOptimizationService);
//# sourceMappingURL=storage-optimization.service.js.map