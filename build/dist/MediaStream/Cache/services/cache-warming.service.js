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
var CacheWarmingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheWarmingService = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_process_1 = require("node:process");
const memory_cache_service_1 = require("./memory-cache.service");
const config_service_1 = require("../../Config/config.service");
const logger_util_1 = require("../../Correlation/utils/logger.util");
const metrics_service_1 = require("../../Metrics/services/metrics.service");
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
let CacheWarmingService = CacheWarmingService_1 = class CacheWarmingService {
    constructor(memoryCacheService, configService, metricsService) {
        this.memoryCacheService = memoryCacheService;
        this.configService = configService;
        this.metricsService = metricsService;
        this.logger = new common_1.Logger(CacheWarmingService_1.name);
        this.config = this.configService.get('cache.warming') || {
            enabled: true,
            warmupOnStart: true,
            maxFilesToWarm: 50,
            warmupCron: '0 */6 * * *',
            popularImageThreshold: 5,
        };
        this.storagePath = (0, node_path_1.join)((0, node_process_1.cwd)(), 'storage');
    }
    async onModuleInit() {
        if (this.config.enabled && this.config.warmupOnStart) {
            logger_util_1.CorrelatedLogger.log('Starting cache warming on module initialization', CacheWarmingService_1.name);
            setImmediate(() => this.warmupCache());
        }
    }
    async scheduledWarmup() {
        if (this.config.enabled) {
            logger_util_1.CorrelatedLogger.log('Starting scheduled cache warmup', CacheWarmingService_1.name);
            await this.warmupCache();
        }
    }
    async warmupCache() {
        if (!this.config.enabled) {
            logger_util_1.CorrelatedLogger.debug('Cache warming is disabled', CacheWarmingService_1.name);
            return;
        }
        const startTime = Date.now();
        let warmedCount = 0;
        try {
            logger_util_1.CorrelatedLogger.log('Starting cache warmup process', CacheWarmingService_1.name);
            const popularFiles = await this.getPopularFiles();
            for (const fileInfo of popularFiles.slice(0, this.config.maxFilesToWarm)) {
                try {
                    await this.warmupFile(fileInfo);
                    warmedCount++;
                }
                catch (error) {
                    logger_util_1.CorrelatedLogger.warn(`Failed to warm up file ${fileInfo.path}: ${error.message}`, CacheWarmingService_1.name);
                }
            }
            const duration = Date.now() - startTime;
            logger_util_1.CorrelatedLogger.log(`Cache warmup completed: ${warmedCount} files warmed in ${duration}ms`, CacheWarmingService_1.name);
            this.metricsService.recordCacheOperation('warmup', 'memory', 'success');
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Cache warmup failed: ${error.message}`, error.stack, CacheWarmingService_1.name);
            this.metricsService.recordCacheOperation('warmup', 'memory', 'error');
        }
    }
    async getPopularFiles() {
        const files = [];
        try {
            const entries = await (0, promises_1.readdir)(this.storagePath);
            for (const entry of entries) {
                if (entry.endsWith('.rsc')) {
                    const filePath = (0, node_path_1.join)(this.storagePath, entry);
                    const metaPath = filePath.replace('.rsc', '.rsm');
                    try {
                        const [fileStat, metaContent] = await Promise.all([
                            (0, promises_1.stat)(filePath),
                            (0, promises_1.readFile)(metaPath, 'utf8').catch(() => null),
                        ]);
                        let accessCount = 1;
                        if (metaContent) {
                            try {
                                const metadata = JSON.parse(metaContent);
                                accessCount = metadata.accessCount || 1;
                            }
                            catch {
                            }
                        }
                        files.push({
                            path: filePath,
                            lastAccessed: fileStat.atime,
                            accessCount,
                            size: fileStat.size,
                        });
                    }
                    catch (error) {
                        logger_util_1.CorrelatedLogger.debug(`Skipping file ${entry}: ${error.message}`, CacheWarmingService_1.name);
                    }
                }
            }
            return files
                .filter(f => f.accessCount >= this.config.popularImageThreshold)
                .sort((a, b) => {
                if (a.accessCount !== b.accessCount) {
                    return b.accessCount - a.accessCount;
                }
                return b.lastAccessed.getTime() - a.lastAccessed.getTime();
            });
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Failed to get popular files: ${error.message}`, error.stack, CacheWarmingService_1.name);
            return [];
        }
    }
    async warmupFile(fileInfo) {
        const cacheKey = this.generateCacheKey(fileInfo.path);
        if (await this.memoryCacheService.has(cacheKey)) {
            logger_util_1.CorrelatedLogger.debug(`File already in cache: ${fileInfo.path}`, CacheWarmingService_1.name);
            return;
        }
        try {
            const content = await (0, promises_1.readFile)(fileInfo.path);
            const baseTtl = 3600;
            const accessMultiplier = Math.min(fileInfo.accessCount / 10, 5);
            const ttl = Math.floor(baseTtl * (1 + accessMultiplier));
            await this.memoryCacheService.set(cacheKey, content, ttl);
            logger_util_1.CorrelatedLogger.debug(`Warmed up file: ${fileInfo.path} (TTL: ${ttl}s)`, CacheWarmingService_1.name);
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.warn(`Failed to warm up file ${fileInfo.path}: ${error.message}`, CacheWarmingService_1.name);
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
            logger_util_1.CorrelatedLogger.debug(`Manually warmed up resource: ${resourceId}`, CacheWarmingService_1.name);
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Failed to manually warm up resource ${resourceId}: ${error.message}`, error.stack, CacheWarmingService_1.name);
            throw error;
        }
    }
    async getWarmupStats() {
        const stats = await this.memoryCacheService.getStats();
        return {
            enabled: this.config.enabled,
            lastWarmup: null,
            filesWarmed: stats.keys,
            cacheSize: stats.vsize + stats.ksize,
        };
    }
};
exports.CacheWarmingService = CacheWarmingService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_6_HOURS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CacheWarmingService.prototype, "scheduledWarmup", null);
exports.CacheWarmingService = CacheWarmingService = CacheWarmingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [memory_cache_service_1.MemoryCacheService,
        config_service_1.ConfigService,
        metrics_service_1.MetricsService])
], CacheWarmingService);
//# sourceMappingURL=cache-warming.service.js.map