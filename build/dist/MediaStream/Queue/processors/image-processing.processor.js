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
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cwd, hrtime } from "node:process";
import { MultiLayerCacheManager } from "../../Cache/services/multi-layer-cache.manager.js";
import { CorrelationService } from "../../Correlation/services/correlation.service.js";
import ResourceMetaData from "../../HTTP/dto/resource-meta-data.dto.js";
import { HttpClientService } from "../../HTTP/services/http-client.service.js";
import { Injectable, Logger } from "@nestjs/common";
import sharp from "sharp";
export class ImageProcessingProcessor {
    async process(job) {
        const startTime = Date.now();
        const { imageUrl, width, height, quality, format, cacheKey, correlationId, fit, position, background, trimThreshold } = job.data;
        this.processedCount++;
        if (this.processedCount % 20 === 0 && globalThis.gc) {
            try {
                globalThis.gc();
                this._logger.debug(`Triggered garbage collection after ${this.processedCount} processed images`);
            } catch  {}
        }
        return this._correlationService.runWithContext({
            correlationId,
            timestamp: Date.now(),
            clientIp: 'queue-worker',
            method: 'JOB',
            url: `/queue/image-processing/${job.id}`,
            startTime: hrtime.bigint()
        }, async ()=>{
            try {
                this._logger.debug(`Processing image job ${job.id} for URL: ${imageUrl} with options:`, {
                    width,
                    height,
                    quality,
                    format,
                    fit,
                    position,
                    background,
                    trimThreshold
                });
                const cached = await this.cacheManager.get('image', cacheKey);
                if (cached) {
                    this._logger.debug(`Image already cached for job ${job.id}`);
                    return {
                        success: true,
                        data: cached,
                        processingTime: Date.now() - startTime,
                        cacheHit: true
                    };
                }
                await this.updateProgress(job, 25, 'Downloading image');
                const imageBuffer = await this.downloadImage(imageUrl);
                await this.updateProgress(job, 50, 'Processing image');
                const processedBuffer = await this.processImage(imageBuffer, {
                    width: width ? Number(width) : undefined,
                    height: height ? Number(height) : undefined,
                    quality: quality ? Number(quality) : undefined,
                    format,
                    fit,
                    position,
                    background,
                    trimThreshold: trimThreshold ? Number(trimThreshold) : undefined
                });
                await this.updateProgress(job, 75, 'Caching result');
                const metadata = new ResourceMetaData({
                    version: 1,
                    size: processedBuffer.length.toString(),
                    format: format || 'webp',
                    dateCreated: Date.now(),
                    publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                    privateTTL: 6 * 30 * 24 * 60 * 60 * 1000
                });
                await this.cacheManager.set('image', cacheKey, {
                    data: processedBuffer,
                    metadata
                }, metadata.privateTTL);
                const basePath = cwd();
                const resourcePath = join(basePath, 'storage', `${cacheKey}.rsc`);
                const metadataPath = join(basePath, 'storage', `${cacheKey}.rsm`);
                try {
                    await Promise.all([
                        writeFile(resourcePath, processedBuffer),
                        writeFile(metadataPath, JSON.stringify(metadata), 'utf8')
                    ]);
                    this._logger.debug(`Saved processed image to filesystem: ${resourcePath}`);
                } catch (fsError) {
                    this._logger.warn(`Failed to save to filesystem: ${fsError.message}`);
                }
                await this.updateProgress(job, 100, 'Completed');
                const processingTime = Date.now() - startTime;
                this._logger.debug(`Image processing completed for job ${job.id} in ${processingTime}ms`);
                return {
                    success: true,
                    data: processedBuffer,
                    processingTime,
                    cacheHit: false
                };
            } catch (error) {
                const processingTime = Date.now() - startTime;
                this._logger.error(`Image processing failed for job ${job.id}:`, error);
                return {
                    success: false,
                    error: error.message,
                    processingTime,
                    cacheHit: false
                };
            }
        });
    }
    async downloadImage(url) {
        try {
            const response = await this.httpClient.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000
            });
            return Buffer.from(response.data);
        } catch (error) {
            this._logger.error(`Failed to download image from ${url}:`, error);
            throw new Error(`Failed to download image: ${error.message}`);
        }
    }
    async processImage(buffer, options) {
        let pipeline = null;
        try {
            pipeline = sharp(buffer, {
                failOn: 'none',
                limitInputPixels: 268402689,
                sequentialRead: true,
                density: 72
            });
            if (options.trimThreshold !== undefined && options.trimThreshold > 0) {
                pipeline = pipeline.trim({
                    background: options.background,
                    threshold: options.trimThreshold
                });
            }
            if (options.width || options.height) {
                const resizeOptions = {
                    fastShrinkOnLoad: true,
                    kernel: 'lanczos3'
                };
                if (options.width) resizeOptions.width = options.width;
                if (options.height) resizeOptions.height = options.height;
                if (options.fit) resizeOptions.fit = options.fit;
                if (options.position) resizeOptions.position = options.position;
                if (options.background) resizeOptions.background = options.background;
                this._logger.debug('Applying Sharp resize with options:', resizeOptions);
                pipeline = pipeline.resize(resizeOptions);
            }
            const qual = options.quality || 80;
            switch(options.format){
                case 'webp':
                    pipeline = pipeline.webp({
                        quality: qual,
                        smartSubsample: true,
                        nearLossless: true
                    });
                    break;
                case 'jpeg':
                case 'jpg':
                    pipeline = pipeline.jpeg({
                        quality: qual,
                        progressive: true,
                        optimizeCoding: true,
                        mozjpeg: true,
                        trellisQuantisation: true,
                        overshootDeringing: true
                    });
                    break;
                case 'png':
                    pipeline = pipeline.png({
                        quality: qual,
                        compressionLevel: 6,
                        adaptiveFiltering: true,
                        palette: qual < 95
                    });
                    break;
                case 'avif':
                    pipeline = pipeline.avif({
                        quality: Math.min(qual, 75),
                        effort: 4,
                        chromaSubsampling: '4:2:0'
                    });
                    break;
                default:
                    pipeline = pipeline.webp({
                        quality: 80,
                        effort: 4,
                        smartSubsample: true
                    });
                    break;
            }
            const result = await pipeline.withMetadata({
                density: 72
            }).toBuffer();
            if (pipeline) {
                pipeline.destroy();
            }
            return result;
        } catch (error) {
            if (pipeline) {
                try {
                    pipeline.destroy();
                } catch  {}
            }
            this._logger.error('Failed to process image:', error);
            throw new Error(`Image processing failed: ${error.message}`);
        }
    }
    async updateProgress(job, progress, message) {
        try {
            // Note: This would need to be implemented based on the actual Bull job instance
            // For now, we'll just log the progress
            this._logger.debug(`Job ${job.id} progress: ${progress}% - ${message}`);
        } catch (error) {
            this._logger.warn(`Failed to update job progress: ${error.message}`);
        }
    }
    constructor(_correlationService, httpClient, cacheManager){
        this._correlationService = _correlationService;
        this.httpClient = httpClient;
        this.cacheManager = cacheManager;
        this._logger = new Logger(ImageProcessingProcessor.name);
        this.processedCount = 0;
        sharp.cache({
            memory: 50,
            files: 10,
            items: 100
        });
        sharp.concurrency(ImageProcessingProcessor.MAX_SHARP_INSTANCES);
        sharp.simd(true);
    }
}
ImageProcessingProcessor.MAX_SHARP_INSTANCES = 4;
ImageProcessingProcessor = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof CorrelationService === "undefined" ? Object : CorrelationService,
        typeof HttpClientService === "undefined" ? Object : HttpClientService,
        typeof MultiLayerCacheManager === "undefined" ? Object : MultiLayerCacheManager
    ])
], ImageProcessingProcessor);

//# sourceMappingURL=image-processing.processor.js.map