function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { cwd } from "node:process";
import { MemoryCacheService } from "./memory-cache.service.js";
import { ConfigService } from "../../Config/config.service.js";
import { CorrelatedLogger } from "../../Correlation/utils/logger.util.js";
import { MetricsService } from "../../Metrics/services/metrics.service.js";
import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
export class CacheWarmingService {
    async onModuleInit() {
        if (this.config.enabled && this.config.warmupOnStart) {
            CorrelatedLogger.log('Starting cache warming on module initialization', CacheWarmingService.name);
            setImmediate(()=>this.warmupCache());
        }
    }
    async scheduledWarmup() {
        if (this.config.enabled) {
            CorrelatedLogger.log('Starting scheduled cache warmup', CacheWarmingService.name);
            await this.warmupCache();
        }
    }
    async warmupCache() {
        if (!this.config.enabled) {
            CorrelatedLogger.debug('Cache warming is disabled', CacheWarmingService.name);
            return;
        }
        const startTime = Date.now();
        let warmedCount = 0;
        try {
            CorrelatedLogger.log('Starting cache warmup process', CacheWarmingService.name);
            const popularFiles = await this.getPopularFiles();
            for (const fileInfo of popularFiles.slice(0, this.config.maxFilesToWarm)){
                try {
                    await this.warmupFile(fileInfo);
                    warmedCount++;
                } catch (error) {
                    CorrelatedLogger.warn(`Failed to warm up file ${fileInfo.path}: ${error.message}`, CacheWarmingService.name);
                }
            }
            const duration = Date.now() - startTime;
            CorrelatedLogger.log(`Cache warmup completed: ${warmedCount} files warmed in ${duration}ms`, CacheWarmingService.name);
            this.metricsService.recordCacheOperation('warmup', 'memory', 'success');
        } catch (error) {
            CorrelatedLogger.error(`Cache warmup failed: ${error.message}`, error.stack, CacheWarmingService.name);
            this.metricsService.recordCacheOperation('warmup', 'memory', 'error');
        }
    }
    async getPopularFiles() {
        const files = [];
        try {
            const entries = await readdir(this.storagePath);
            for (const entry of entries){
                if (entry.endsWith('.rsc')) {
                    const filePath = join(this.storagePath, entry);
                    const metaPath = filePath.replace('.rsc', '.rsm');
                    try {
                        const [fileStat, metaContent] = await Promise.all([
                            stat(filePath),
                            readFile(metaPath, 'utf8').catch(()=>null)
                        ]);
                        let accessCount = 1;
                        if (metaContent) {
                            try {
                                const metadata = JSON.parse(metaContent);
                                accessCount = metadata.accessCount || 1;
                            } catch  {
                            // Ignore metadata parsing errors
                            }
                        }
                        files.push({
                            path: filePath,
                            lastAccessed: fileStat.atime,
                            accessCount,
                            size: fileStat.size
                        });
                    } catch (error) {
                        CorrelatedLogger.debug(`Skipping file ${entry}: ${error.message}`, CacheWarmingService.name);
                    }
                }
            }
            return files.filter((f)=>f.accessCount >= this.config.popularImageThreshold).sort((a, b)=>{
                if (a.accessCount !== b.accessCount) {
                    return b.accessCount - a.accessCount;
                }
                return b.lastAccessed.getTime() - a.lastAccessed.getTime();
            });
        } catch (error) {
            CorrelatedLogger.error(`Failed to get popular files: ${error.message}`, error.stack, CacheWarmingService.name);
            return [];
        }
    }
    async warmupFile(fileInfo) {
        const cacheKey = this.generateCacheKey(fileInfo.path);
        if (await this.memoryCacheService.has(cacheKey)) {
            CorrelatedLogger.debug(`File already in cache: ${fileInfo.path}`, CacheWarmingService.name);
            return;
        }
        try {
            const content = await readFile(fileInfo.path);
            const baseTtl = 3600;
            const accessMultiplier = Math.min(fileInfo.accessCount / 10, 5);
            const ttl = Math.floor(baseTtl * (1 + accessMultiplier));
            await this.memoryCacheService.set(cacheKey, content, ttl);
            CorrelatedLogger.debug(`Warmed up file: ${fileInfo.path} (TTL: ${ttl}s)`, CacheWarmingService.name);
        } catch (error) {
            CorrelatedLogger.warn(`Failed to warm up file ${fileInfo.path}: ${error.message}`, CacheWarmingService.name);
            throw error;
        }
    }
    generateCacheKey(filePath) {
        const filename = filePath.split('/').pop() || filePath.split('\\').pop();
        return `file:${filename?.replace(/\.[^/.]+$/, '')}`;
    }
    async warmupSpecificFile(resourceId, content, ttl) {
        try {
            const cacheKey = `file:${resourceId}`;
            await this.memoryCacheService.set(cacheKey, content, ttl);
            CorrelatedLogger.debug(`Manually warmed up resource: ${resourceId}`, CacheWarmingService.name);
        } catch (error) {
            CorrelatedLogger.error(`Failed to manually warm up resource ${resourceId}: ${error.message}`, error.stack, CacheWarmingService.name);
            throw error;
        }
    }
    async getWarmupStats() {
        const stats = await this.memoryCacheService.getStats();
        return {
            enabled: this.config.enabled,
            lastWarmup: null,
            filesWarmed: stats.keys,
            cacheSize: stats.vsize + stats.ksize
        };
    }
    constructor(memoryCacheService, _configService, metricsService){
        this.memoryCacheService = memoryCacheService;
        this._configService = _configService;
        this.metricsService = metricsService;
        this.config = this._configService.get('cache.warming') || {
            enabled: true,
            warmupOnStart: true,
            maxFilesToWarm: 50,
            warmupCron: '0 */6 * * *',
            popularImageThreshold: 5
        };
        this.storagePath = join(cwd(), 'storage');
    }
}
_ts_decorate([
    Cron(CronExpression.EVERY_6_HOURS),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], CacheWarmingService.prototype, "scheduledWarmup", null);
CacheWarmingService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof MemoryCacheService === "undefined" ? Object : MemoryCacheService,
        typeof ConfigService === "undefined" ? Object : ConfigService,
        typeof MetricsService === "undefined" ? Object : MetricsService
    ])
], CacheWarmingService);

//# sourceMappingURL=cache-warming.service.js.map