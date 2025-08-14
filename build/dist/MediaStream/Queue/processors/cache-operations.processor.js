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
var CacheOperationsProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheOperationsProcessor = void 0;
const node_buffer_1 = require("node:buffer");
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const process = __importStar(require("node:process"));
const multi_layer_cache_manager_1 = require("../../Cache/services/multi-layer-cache.manager");
const correlation_service_1 = require("../../Correlation/services/correlation.service");
const http_client_service_1 = require("../../HTTP/services/http-client.service");
const common_1 = require("@nestjs/common");
let CacheOperationsProcessor = CacheOperationsProcessor_1 = class CacheOperationsProcessor {
    constructor(_correlationService, cacheManager, httpClient) {
        this._correlationService = _correlationService;
        this.cacheManager = cacheManager;
        this.httpClient = httpClient;
        this._logger = new common_1.Logger(CacheOperationsProcessor_1.name);
    }
    async processCacheWarming(job) {
        const startTime = Date.now();
        const { imageUrls, batchSize = 5, correlationId } = job.data;
        return this._correlationService.runWithContext({
            correlationId,
            timestamp: Date.now(),
            clientIp: 'queue-worker',
            method: 'JOB',
            url: `/queue/cache-warming/${job.id}`,
            startTime: process.hrtime.bigint(),
        }, async () => {
            try {
                this._logger.debug(`Starting cache warming job ${job.id} for ${imageUrls.length} images`);
                let processed = 0;
                let successful = 0;
                let failed = 0;
                for (let i = 0; i < imageUrls.length; i += batchSize) {
                    const batch = imageUrls.slice(i, i + batchSize);
                    const batchPromises = batch.map(async (url) => {
                        try {
                            await this.warmCacheForImage(url);
                            successful++;
                            return true;
                        }
                        catch (error) {
                            this._logger.warn(`Failed to warm cache for ${url}:`, error);
                            failed++;
                            return false;
                        }
                    });
                    await Promise.allSettled(batchPromises);
                    processed += batch.length;
                    const progress = Math.round((processed / imageUrls.length) * 100);
                    this._logger.debug(`Cache warming progress: ${progress}% (${processed}/${imageUrls.length})`);
                }
                const processingTime = Date.now() - startTime;
                this._logger.log(`Cache warming completed: ${successful} successful, ${failed} failed in ${processingTime}ms`);
                return {
                    success: true,
                    data: { successful, failed, total: imageUrls.length },
                    processingTime,
                };
            }
            catch (error) {
                const processingTime = Date.now() - startTime;
                this._logger.error(`Cache warming job ${job.id} failed:`, error);
                return {
                    success: false,
                    error: error.message,
                    processingTime,
                };
            }
        });
    }
    async processCacheCleanup(job) {
        const startTime = Date.now();
        const { maxAge, maxSize, correlationId } = job.data;
        return this._correlationService.runWithContext({
            correlationId,
            timestamp: Date.now(),
            clientIp: 'queue-worker',
            method: 'JOB',
            url: `/queue/cache-cleanup/${job.id}`,
            startTime: process.hrtime.bigint(),
        }, async () => {
            try {
                this._logger.debug(`Starting cache cleanup job ${job.id}`);
                const cleanupResults = await Promise.allSettled([
                    this.cleanupMemoryCache(),
                    this.cleanupFileCache(maxAge, maxSize),
                ]);
                let totalCleaned = 0;
                const errors = [];
                cleanupResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        totalCleaned += result.value.cleaned;
                    }
                    else {
                        const operation = index === 0 ? 'memory cache' : 'file cache';
                        errors.push(`${operation}: ${result.reason.message}`);
                    }
                });
                const processingTime = Date.now() - startTime;
                if (errors.length > 0) {
                    this._logger.warn(`Cache cleanup completed with errors: ${errors.join(', ')}`);
                }
                else {
                    this._logger.log(`Cache cleanup completed: ${totalCleaned} items cleaned in ${processingTime}ms`);
                }
                return {
                    success: errors.length === 0,
                    data: { cleaned: totalCleaned, errors },
                    processingTime,
                };
            }
            catch (error) {
                const processingTime = Date.now() - startTime;
                this._logger.error(`Cache cleanup job ${job.id} failed:`, error);
                return {
                    success: false,
                    error: error.message,
                    processingTime,
                };
            }
        });
    }
    async warmCacheForImage(imageUrl) {
        try {
            const cacheKey = this.generateCacheKey(imageUrl);
            const cached = await this.cacheManager.get('images', cacheKey);
            if (cached) {
                this._logger.debug(`Image already cached: ${imageUrl}`);
                return;
            }
            const response = await this.httpClient.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
            });
            const buffer = node_buffer_1.Buffer.from(response.data);
            await this.cacheManager.set('images', cacheKey, buffer.toString('base64'), 3600);
            this._logger.debug(`Cached image: ${imageUrl}`);
        }
        catch (error) {
            throw new Error(`Failed to warm cache for ${imageUrl}: ${error.message}`);
        }
    }
    async cleanupMemoryCache() {
        try {
            await this.cacheManager.getStats();
            const cleaned = 0;
            this._logger.debug(`Memory cache cleanup completed: ${cleaned} items cleaned`);
            return { cleaned };
        }
        catch (error) {
            throw new Error(`Memory cache cleanup failed: ${error.message}`);
        }
    }
    async cleanupFileCache(maxAge, maxSize) {
        try {
            const cacheDir = path.join(process.cwd(), 'storage');
            let cleaned = 0;
            try {
                const files = await fs.readdir(cacheDir);
                const now = Date.now();
                for (const file of files) {
                    const filePath = path.join(cacheDir, file);
                    try {
                        const stats = await fs.stat(filePath);
                        const age = now - stats.mtime.getTime();
                        if (age > maxAge) {
                            await fs.unlink(filePath);
                            cleaned++;
                            continue;
                        }
                        if (stats.size > maxSize) {
                            await fs.unlink(filePath);
                            cleaned++;
                        }
                    }
                    catch (fileError) {
                        this._logger.warn(`Failed to process file ${file}:`, fileError);
                    }
                }
            }
            catch (dirError) {
                if (dirError.code !== 'ENOENT') {
                    throw dirError;
                }
            }
            this._logger.debug(`File cache cleanup completed: ${cleaned} files cleaned`);
            return { cleaned };
        }
        catch (error) {
            throw new Error(`File cache cleanup failed: ${error.message}`);
        }
    }
    generateCacheKey(imageUrl) {
        const hash = node_buffer_1.Buffer.from(imageUrl).toString('base64').replace(/[/+=]/g, '');
        return `image:${hash}`;
    }
};
exports.CacheOperationsProcessor = CacheOperationsProcessor;
exports.CacheOperationsProcessor = CacheOperationsProcessor = CacheOperationsProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [correlation_service_1.CorrelationService,
        multi_layer_cache_manager_1.MultiLayerCacheManager,
        http_client_service_1.HttpClientService])
], CacheOperationsProcessor);
//# sourceMappingURL=cache-operations.processor.js.map