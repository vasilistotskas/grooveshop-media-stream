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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ImageProcessingProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageProcessingProcessor = void 0;
const node_buffer_1 = require("node:buffer");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_process_1 = require("node:process");
const multi_layer_cache_manager_1 = require("../../Cache/services/multi-layer-cache.manager");
const correlation_service_1 = require("../../Correlation/services/correlation.service");
const resource_meta_data_dto_1 = __importDefault(require("../../HTTP/dto/resource-meta-data.dto"));
const http_client_service_1 = require("../../HTTP/services/http-client.service");
const common_1 = require("@nestjs/common");
const sharp_1 = __importDefault(require("sharp"));
let ImageProcessingProcessor = ImageProcessingProcessor_1 = class ImageProcessingProcessor {
    constructor(_correlationService, httpClient, cacheManager) {
        this._correlationService = _correlationService;
        this.httpClient = httpClient;
        this.cacheManager = cacheManager;
        this._logger = new common_1.Logger(ImageProcessingProcessor_1.name);
        sharp_1.default.cache({
            memory: 100,
            files: 20,
            items: 200,
        });
        sharp_1.default.concurrency(ImageProcessingProcessor_1.MAX_SHARP_INSTANCES);
        sharp_1.default.simd(true);
    }
    async process(job) {
        const startTime = Date.now();
        const { imageUrl, width, height, quality, format, cacheKey, correlationId, fit, position, background, trimThreshold } = job.data;
        return this._correlationService.runWithContext({
            correlationId,
            timestamp: Date.now(),
            clientIp: 'queue-worker',
            method: 'JOB',
            url: `/queue/image-processing/${job.id}`,
            startTime: node_process_1.hrtime.bigint(),
        }, async () => {
            try {
                this._logger.debug(`Processing image job ${job.id} for URL: ${imageUrl} with options:`, {
                    width,
                    height,
                    quality,
                    format,
                    fit,
                    position,
                    background,
                    trimThreshold,
                });
                const cached = await this.cacheManager.get('image', cacheKey);
                if (cached) {
                    this._logger.debug(`Image already cached for job ${job.id}`);
                    return {
                        success: true,
                        data: cached,
                        processingTime: Date.now() - startTime,
                        cacheHit: true,
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
                    trimThreshold: trimThreshold ? Number(trimThreshold) : undefined,
                });
                await this.updateProgress(job, 75, 'Caching result');
                const metadata = new resource_meta_data_dto_1.default({
                    version: 1,
                    size: processedBuffer.length.toString(),
                    format: format || 'webp',
                    dateCreated: Date.now(),
                    publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                    privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
                });
                await this.cacheManager.set('image', cacheKey, {
                    data: processedBuffer,
                    metadata,
                }, metadata.privateTTL);
                const basePath = (0, node_process_1.cwd)();
                const resourcePath = (0, node_path_1.join)(basePath, 'storage', `${cacheKey}.rsc`);
                const metadataPath = (0, node_path_1.join)(basePath, 'storage', `${cacheKey}.rsm`);
                try {
                    await Promise.all([
                        (0, promises_1.writeFile)(resourcePath, processedBuffer),
                        (0, promises_1.writeFile)(metadataPath, JSON.stringify(metadata), 'utf8'),
                    ]);
                    this._logger.debug(`Saved processed image to filesystem: ${resourcePath}`);
                }
                catch (fsError) {
                    this._logger.warn(`Failed to save to filesystem: ${fsError.message}`);
                }
                await this.updateProgress(job, 100, 'Completed');
                const processingTime = Date.now() - startTime;
                this._logger.debug(`Image processing completed for job ${job.id} in ${processingTime}ms`);
                return {
                    success: true,
                    data: processedBuffer,
                    processingTime,
                    cacheHit: false,
                };
            }
            catch (error) {
                const processingTime = Date.now() - startTime;
                this._logger.error(`Image processing failed for job ${job.id}:`, error);
                return {
                    success: false,
                    error: error.message,
                    processingTime,
                    cacheHit: false,
                };
            }
        });
    }
    async downloadImage(url) {
        try {
            const response = await this.httpClient.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
            });
            return node_buffer_1.Buffer.from(response.data);
        }
        catch (error) {
            this._logger.error(`Failed to download image from ${url}:`, error);
            throw new Error(`Failed to download image: ${error.message}`);
        }
    }
    async processImage(buffer, options) {
        try {
            let pipeline = (0, sharp_1.default)(buffer, {
                failOn: 'none',
                limitInputPixels: 268402689,
                sequentialRead: true,
                density: 72,
            });
            if (options.trimThreshold !== undefined && options.trimThreshold > 0) {
                pipeline = pipeline.trim({
                    background: options.background,
                    threshold: options.trimThreshold,
                });
            }
            if (options.width || options.height) {
                const resizeOptions = {
                    fastShrinkOnLoad: true,
                    kernel: 'lanczos3',
                };
                if (options.width)
                    resizeOptions.width = options.width;
                if (options.height)
                    resizeOptions.height = options.height;
                if (options.fit)
                    resizeOptions.fit = options.fit;
                if (options.position)
                    resizeOptions.position = options.position;
                if (options.background)
                    resizeOptions.background = options.background;
                this._logger.debug('Applying Sharp resize with options:', resizeOptions);
                pipeline = pipeline.resize(resizeOptions);
            }
            const qual = options.quality || 80;
            switch (options.format) {
                case 'webp':
                    pipeline = pipeline.webp({
                        quality: Math.min(qual, 85),
                        effort: 4,
                        smartSubsample: true,
                        nearLossless: false,
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
                        overshootDeringing: true,
                    });
                    break;
                case 'png':
                    pipeline = pipeline.png({
                        quality: qual,
                        compressionLevel: 6,
                        adaptiveFiltering: true,
                        palette: qual < 95,
                    });
                    break;
                case 'avif':
                    pipeline = pipeline.avif({
                        quality: Math.min(qual, 75),
                        effort: 4,
                        chromaSubsampling: '4:2:0',
                    });
                    break;
                default:
                    pipeline = pipeline.webp({
                        quality: 80,
                        effort: 4,
                        smartSubsample: true,
                    });
                    break;
            }
            return await pipeline
                .withMetadata({ density: 72 })
                .toBuffer();
        }
        catch (error) {
            this._logger.error('Failed to process image:', error);
            throw new Error(`Image processing failed: ${error.message}`);
        }
    }
    async updateProgress(job, progress, message) {
        try {
            this._logger.debug(`Job ${job.id} progress: ${progress}% - ${message}`);
        }
        catch (error) {
            this._logger.warn(`Failed to update job progress: ${error.message}`);
        }
    }
};
exports.ImageProcessingProcessor = ImageProcessingProcessor;
ImageProcessingProcessor.MAX_SHARP_INSTANCES = 4;
exports.ImageProcessingProcessor = ImageProcessingProcessor = ImageProcessingProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [correlation_service_1.CorrelationService,
        http_client_service_1.HttpClientService,
        multi_layer_cache_manager_1.MultiLayerCacheManager])
], ImageProcessingProcessor);
//# sourceMappingURL=image-processing.processor.js.map