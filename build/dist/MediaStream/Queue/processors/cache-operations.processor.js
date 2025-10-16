function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { Buffer } from "node:buffer";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import { MultiLayerCacheManager } from "../../Cache/services/multi-layer-cache.manager.js";
import { CorrelationService } from "../../Correlation/services/correlation.service.js";
import { HttpClientService } from "../../HTTP/services/http-client.service.js";
import { Injectable, Logger } from "@nestjs/common";
export class CacheOperationsProcessor {
    constructor(_correlationService, cacheManager, httpClient){
        this._correlationService = _correlationService;
        this.cacheManager = cacheManager;
        this.httpClient = httpClient;
        this._logger = new Logger(CacheOperationsProcessor.name);
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
            startTime: process.hrtime.bigint()
        }, async ()=>{
            try {
                this._logger.debug(`Starting cache warming job ${job.id} for ${imageUrls.length} images`);
                let processed = 0;
                let successful = 0;
                let failed = 0;
                for(let i = 0; i < imageUrls.length; i += batchSize){
                    const batch = imageUrls.slice(i, i + batchSize);
                    const batchPromises = batch.map(async (url)=>{
                        try {
                            await this.warmCacheForImage(url);
                            successful++;
                            return true;
                        } catch (error) {
                            this._logger.warn(`Failed to warm cache for ${url}:`, error);
                            failed++;
                            return false;
                        }
                    });
                    await Promise.allSettled(batchPromises);
                    processed += batch.length;
                    const progress = Math.round(processed / imageUrls.length * 100);
                    this._logger.debug(`Cache warming progress: ${progress}% (${processed}/${imageUrls.length})`);
                }
                const processingTime = Date.now() - startTime;
                this._logger.log(`Cache warming completed: ${successful} successful, ${failed} failed in ${processingTime}ms`);
                return {
                    success: true,
                    data: {
                        successful,
                        failed,
                        total: imageUrls.length
                    },
                    processingTime
                };
            } catch (error) {
                const processingTime = Date.now() - startTime;
                this._logger.error(`Cache warming job ${job.id} failed:`, error);
                return {
                    success: false,
                    error: error.message,
                    processingTime
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
            startTime: process.hrtime.bigint()
        }, async ()=>{
            try {
                this._logger.debug(`Starting cache cleanup job ${job.id}`);
                const cleanupResults = await Promise.allSettled([
                    this.cleanupMemoryCache(),
                    this.cleanupFileCache(maxAge, maxSize)
                ]);
                let totalCleaned = 0;
                const errors = [];
                cleanupResults.forEach((result, index)=>{
                    if (result.status === 'fulfilled') {
                        totalCleaned += result.value.cleaned;
                    } else {
                        const operation = index === 0 ? 'memory cache' : 'file cache';
                        errors.push(`${operation}: ${result.reason.message}`);
                    }
                });
                const processingTime = Date.now() - startTime;
                if (errors.length > 0) {
                    this._logger.warn(`Cache cleanup completed with errors: ${errors.join(', ')}`);
                } else {
                    this._logger.log(`Cache cleanup completed: ${totalCleaned} items cleaned in ${processingTime}ms`);
                }
                return {
                    success: errors.length === 0,
                    data: {
                        cleaned: totalCleaned,
                        errors
                    },
                    processingTime
                };
            } catch (error) {
                const processingTime = Date.now() - startTime;
                this._logger.error(`Cache cleanup job ${job.id} failed:`, error);
                return {
                    success: false,
                    error: error.message,
                    processingTime
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
                timeout: 30000
            });
            const buffer = Buffer.from(response.data);
            await this.cacheManager.set('images', cacheKey, buffer.toString('base64'), 3600);
            this._logger.debug(`Cached image: ${imageUrl}`);
        } catch (error) {
            throw new Error(`Failed to warm cache for ${imageUrl}: ${error.message}`);
        }
    }
    async cleanupMemoryCache() {
        try {
            await this.cacheManager.getStats();
            // In a real implementation, this would be more sophisticated
            const cleaned = 0;
            this._logger.debug(`Memory cache cleanup completed: ${cleaned} items cleaned`);
            return {
                cleaned
            };
        } catch (error) {
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
                for (const file of files){
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
                    } catch (fileError) {
                        this._logger.warn(`Failed to process file ${file}:`, fileError);
                    }
                }
            } catch (dirError) {
                if (dirError.code !== 'ENOENT') {
                    throw dirError;
                }
            }
            this._logger.debug(`File cache cleanup completed: ${cleaned} files cleaned`);
            return {
                cleaned
            };
        } catch (error) {
            throw new Error(`File cache cleanup failed: ${error.message}`);
        }
    }
    generateCacheKey(imageUrl) {
        // Simple cache key generation - in real implementation this would be more sophisticated
        const hash = Buffer.from(imageUrl).toString('base64').replace(/[/+=]/g, '');
        return `image:${hash}`;
    }
}
CacheOperationsProcessor = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof CorrelationService === "undefined" ? Object : CorrelationService,
        typeof MultiLayerCacheManager === "undefined" ? Object : MultiLayerCacheManager,
        typeof HttpClientService === "undefined" ? Object : HttpClientService
    ])
], CacheOperationsProcessor);

//# sourceMappingURL=cache-operations.processor.js.map