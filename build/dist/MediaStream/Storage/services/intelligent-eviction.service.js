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
import { Injectable } from "@nestjs/common";
import { StorageMonitoringService } from "./storage-monitoring.service.js";
export class IntelligentEvictionService {
    /**
	 * Perform intelligent cache eviction based on access patterns
	 */ async performEviction(targetSize) {
        const startTime = Date.now();
        try {
            CorrelatedLogger.debug(`Starting intelligent eviction with strategy: ${this.config.strategy}`, IntelligentEvictionService.name);
            await this.storageMonitoring.getStorageStats();
            const candidates = await this.storageMonitoring.getEvictionCandidates(targetSize);
            if (candidates.length === 0) {
                return {
                    filesEvicted: 0,
                    sizeFreed: 0,
                    errors: [],
                    strategy: this.config.strategy,
                    duration: Date.now() - startTime
                };
            }
            const strategy = this.strategies.get(this.config.strategy);
            if (!strategy) {
                throw new Error(`Unknown eviction strategy: ${this.config.strategy}`);
            }
            const finalCandidates = await strategy.execute(candidates, targetSize || 0);
            const result = await this.evictFiles(finalCandidates);
            result.strategy = this.config.strategy;
            result.duration = Date.now() - startTime;
            CorrelatedLogger.log(`Eviction completed: ${result.filesEvicted} files, ${this.formatBytes(result.sizeFreed)} freed`, IntelligentEvictionService.name);
            return result;
        } catch (error) {
            CorrelatedLogger.error(`Eviction failed: ${error.message}`, error.stack, IntelligentEvictionService.name);
            return {
                filesEvicted: 0,
                sizeFreed: 0,
                errors: [
                    error.message
                ],
                strategy: this.config.strategy,
                duration: Date.now() - startTime
            };
        }
    }
    /**
	 * Perform eviction based on storage thresholds
	 */ async performThresholdBasedEviction() {
        const thresholdCheck = await this.storageMonitoring.checkThresholds();
        if (thresholdCheck.status === 'healthy') {
            return {
                filesEvicted: 0,
                sizeFreed: 0,
                errors: [],
                strategy: 'threshold-based',
                duration: 0
            };
        }
        let targetReduction;
        if (thresholdCheck.status === 'critical') {
            targetReduction = Math.floor(thresholdCheck.stats.totalSize * 0.4);
        } else {
            targetReduction = Math.floor(thresholdCheck.stats.totalSize * 0.2);
        }
        return this.performEviction(targetReduction);
    }
    /**
	 * Get eviction recommendations without executing
	 */ async getEvictionRecommendations(targetSize) {
        const candidates = await this.storageMonitoring.getEvictionCandidates(targetSize);
        const strategy = this.strategies.get(this.config.strategy);
        if (!strategy) {
            throw new Error(`Unknown eviction strategy: ${this.config.strategy}`);
        }
        const finalCandidates = await strategy.execute(candidates, targetSize || 0);
        const totalSize = finalCandidates.reduce((sum, candidate)=>sum + candidate.size, 0);
        const reasoning = this.generateEvictionReasoning(finalCandidates);
        return {
            candidates: finalCandidates,
            totalSize,
            strategy: this.config.strategy,
            reasoning
        };
    }
    initializeStrategies() {
        this.strategies.set('lru', {
            name: 'LRU',
            description: 'Evict least recently used files',
            execute: async (candidates, targetSize)=>{
                return candidates.sort((a, b)=>a.lastAccessed.getTime() - b.lastAccessed.getTime()).slice(0, this.calculateFileCount(candidates, targetSize));
            }
        });
        this.strategies.set('lfu', {
            name: 'LFU',
            description: 'Evict least frequently used files',
            execute: async (candidates, targetSize)=>{
                return candidates.sort((a, b)=>a.accessCount - b.accessCount).slice(0, this.calculateFileCount(candidates, targetSize));
            }
        });
        this.strategies.set('size-based', {
            name: 'Size-based',
            description: 'Evict largest files first',
            execute: async (candidates, targetSize)=>{
                return candidates.sort((a, b)=>b.size - a.size).slice(0, this.calculateFileCount(candidates, targetSize));
            }
        });
        this.strategies.set('age-based', {
            name: 'Age-based',
            description: 'Evict oldest files first',
            execute: async (candidates, targetSize)=>{
                const maxAge = this.config.maxFileAge * 24 * 60 * 60 * 1000;
                const cutoffDate = new Date(Date.now() - maxAge);
                return candidates.filter((candidate)=>candidate.lastAccessed < cutoffDate).sort((a, b)=>a.lastAccessed.getTime() - b.lastAccessed.getTime()).slice(0, this.calculateFileCount(candidates, targetSize));
            }
        });
        this.strategies.set('intelligent', {
            name: 'Intelligent',
            description: 'Combines access patterns, size, and age for optimal eviction',
            execute: async (candidates, targetSize)=>{
                let filtered = candidates;
                if (this.config.preservePopular) {
                    filtered = candidates.filter((candidate)=>candidate.accessCount < this.config.minAccessCount);
                }
                const aggressivenessMultiplier = this.getAggressivenessMultiplier();
                const adjustedTargetSize = targetSize * aggressivenessMultiplier;
                return filtered.slice(0, this.calculateFileCount(filtered, adjustedTargetSize));
            }
        });
    }
    async evictFiles(candidates) {
        let filesEvicted = 0;
        let sizeFreed = 0;
        const errors = [];
        for (const candidate of candidates){
            try {
                const filePath = join(this.storageDirectory, candidate.file);
                await fs.unlink(filePath);
                filesEvicted++;
                sizeFreed += candidate.size;
                CorrelatedLogger.debug(`Evicted file: ${candidate.file} (${this.formatBytes(candidate.size)})`, IntelligentEvictionService.name);
            } catch (error) {
                const errorMsg = `Failed to evict ${candidate.file}: ${error.message}`;
                errors.push(errorMsg);
                CorrelatedLogger.warn(errorMsg, IntelligentEvictionService.name);
            }
        }
        return {
            filesEvicted,
            sizeFreed,
            errors,
            strategy: '',
            duration: 0
        };
    }
    calculateFileCount(candidates, targetSize) {
        if (targetSize <= 0) return candidates.length;
        let currentSize = 0;
        let count = 0;
        for (const candidate of candidates){
            currentSize += candidate.size;
            count++;
            if (currentSize >= targetSize) {
                break;
            }
        }
        return count;
    }
    getAggressivenessMultiplier() {
        switch(this.config.aggressiveness){
            case 'conservative':
                return 0.8;
            case 'moderate':
                return 1.0;
            case 'aggressive':
                return 1.5;
            default:
                return 1.0;
        }
    }
    generateEvictionReasoning(candidates) {
        const reasoning = [];
        if (candidates.length === 0) {
            reasoning.push('No files selected for eviction');
            return reasoning;
        }
        const totalSize = candidates.reduce((sum, c)=>sum + c.size, 0);
        const avgAccessCount = candidates.reduce((sum, c)=>sum + c.accessCount, 0) / candidates.length;
        const oldestAccess = Math.min(...candidates.map((c)=>c.lastAccessed.getTime()));
        const daysSinceOldest = (Date.now() - oldestAccess) / (1000 * 60 * 60 * 24);
        reasoning.push(`Selected ${candidates.length} files totaling ${this.formatBytes(totalSize)}`);
        reasoning.push(`Average access count: ${avgAccessCount.toFixed(1)}`);
        reasoning.push(`Oldest file last accessed ${daysSinceOldest.toFixed(1)} days ago`);
        if (this.config.preservePopular) {
            reasoning.push(`Popular files (>${this.config.minAccessCount} accesses) preserved`);
        }
        reasoning.push(`Strategy: ${this.config.strategy} (${this.config.aggressiveness})`);
        return reasoning;
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
        this.strategies = new Map();
        this.storageDirectory = this._configService.getOptional('cache.file.directory', './storage');
        this.config = {
            strategy: this._configService.getOptional('storage.eviction.strategy', 'intelligent'),
            aggressiveness: this._configService.getOptional('storage.eviction.aggressiveness', 'moderate'),
            preservePopular: this._configService.getOptional('storage.eviction.preservePopular', true),
            minAccessCount: this._configService.getOptional('storage.eviction.minAccessCount', 5),
            maxFileAge: this._configService.getOptional('storage.eviction.maxFileAge', 7)
        };
        this.initializeStrategies();
    }
}
IntelligentEvictionService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ConfigService === "undefined" ? Object : ConfigService,
        typeof StorageMonitoringService === "undefined" ? Object : StorageMonitoringService
    ])
], IntelligentEvictionService);

//# sourceMappingURL=intelligent-eviction.service.js.map