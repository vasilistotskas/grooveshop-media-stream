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
const common_1 = require("@nestjs/common");
const sharp_1 = __importDefault(require("sharp"));
const multi_layer_cache_manager_1 = require("../../Cache/services/multi-layer-cache.manager");
const correlation_service_1 = require("../../Correlation/services/correlation.service");
const http_client_service_1 = require("../../HTTP/services/http-client.service");
let ImageProcessingProcessor = ImageProcessingProcessor_1 = class ImageProcessingProcessor {
    constructor(_correlationService, httpClient, cacheManager) {
        this._correlationService = _correlationService;
        this.httpClient = httpClient;
        this.cacheManager = cacheManager;
        this._logger = new common_1.Logger(ImageProcessingProcessor_1.name);
    }
    async process(job) {
        const startTime = Date.now();
        const { imageUrl, width, height, quality, format, cacheKey } = job.data;
        try {
            this._logger.debug(`Processing image job ${job.id} for URL: ${imageUrl}`);
            const cached = await this.cacheManager.get('images', cacheKey);
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
            });
            await this.updateProgress(job, 75, 'Caching result');
            await this.cacheManager.set('images', cacheKey, processedBuffer.toString('base64'), 3600);
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
            let pipeline = (0, sharp_1.default)(buffer);
            if (options.width || options.height) {
                pipeline = pipeline.resize(options.width, options.height, {
                    fit: 'inside',
                    withoutEnlargement: true,
                });
            }
            switch (options.format) {
                case 'webp':
                    pipeline = pipeline.webp({ quality: options.quality || 80 });
                    break;
                case 'jpeg':
                    pipeline = pipeline.jpeg({ quality: options.quality || 80 });
                    break;
                case 'png':
                    pipeline = pipeline.png({ quality: options.quality || 80 });
                    break;
                default:
                    break;
            }
            return await pipeline.toBuffer();
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
exports.ImageProcessingProcessor = ImageProcessingProcessor = ImageProcessingProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [correlation_service_1.CorrelationService,
        http_client_service_1.HttpClientService,
        multi_layer_cache_manager_1.MultiLayerCacheManager])
], ImageProcessingProcessor);
//# sourceMappingURL=image-processing.processor.js.map