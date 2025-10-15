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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var CacheImageResourceOperation_1;
Object.defineProperty(exports, "__esModule", { value: true });
const node_buffer_1 = require("node:buffer");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const path = __importStar(require("node:path"));
const node_process_1 = require("node:process");
const cache_image_request_dto_1 = require("../../API/dto/cache-image-request.dto");
const unable_to_fetch_resource_exception_1 = __importDefault(require("../../API/exceptions/unable-to-fetch-resource.exception"));
const multi_layer_cache_manager_1 = require("../services/multi-layer-cache.manager");
const logger_util_1 = require("../../Correlation/utils/logger.util");
const performance_tracker_util_1 = require("../../Correlation/utils/performance-tracker.util");
const resource_meta_data_dto_1 = __importDefault(require("../../HTTP/dto/resource-meta-data.dto"));
const metrics_service_1 = require("../../Metrics/services/metrics.service");
const fetch_resource_response_job_1 = __importDefault(require("../../Queue/jobs/fetch-resource-response.job"));
const generate_resource_identity_from_request_job_1 = __importDefault(require("../../Queue/jobs/generate-resource-identity-from-request.job"));
const store_resource_response_to_file_job_1 = __importDefault(require("../../Queue/jobs/store-resource-response-to-file.job"));
const webp_image_manipulation_job_1 = __importDefault(require("../../Queue/jobs/webp-image-manipulation.job"));
const job_queue_manager_1 = require("../../Queue/services/job-queue.manager");
const job_types_1 = require("../../Queue/types/job.types");
const validate_cache_image_request_rule_1 = __importDefault(require("../../Validation/rules/validate-cache-image-request.rule"));
const input_sanitization_service_1 = require("../../Validation/services/input-sanitization.service");
const common_1 = require("@nestjs/common");
let CacheImageResourceOperation = CacheImageResourceOperation_1 = class CacheImageResourceOperation {
    constructor(validateCacheImageRequest, fetchResourceResponseJob, webpImageManipulationJob, storeResourceResponseToFileJob, generateResourceIdentityFromRequestJob, cacheManager, inputSanitizationService, jobQueueManager, metricsService) {
        this.validateCacheImageRequest = validateCacheImageRequest;
        this.fetchResourceResponseJob = fetchResourceResponseJob;
        this.webpImageManipulationJob = webpImageManipulationJob;
        this.storeResourceResponseToFileJob = storeResourceResponseToFileJob;
        this.generateResourceIdentityFromRequestJob = generateResourceIdentityFromRequestJob;
        this.cacheManager = cacheManager;
        this.inputSanitizationService = inputSanitizationService;
        this.jobQueueManager = jobQueueManager;
        this.metricsService = metricsService;
        this.basePath = (0, node_process_1.cwd)();
    }
    get getResourcePath() {
        return path.join(this.basePath, 'storage', `${this.id}.rsc`);
    }
    get getResourceTempPath() {
        return path.join(this.basePath, 'storage', `${this.id}.rst`);
    }
    get getResourceMetaPath() {
        return path.join(this.basePath, 'storage', `${this.id}.rsm`);
    }
    get resourceExists() {
        return (async () => {
            performance_tracker_util_1.PerformanceTracker.startPhase('resource_exists_check');
            try {
                logger_util_1.CorrelatedLogger.debug(`Checking if resource exists in cache: ${this.id}`, CacheImageResourceOperation_1.name);
                const cachedResource = await this.cacheManager.get('image', this.id);
                if (cachedResource) {
                    if (!cachedResource.metadata || typeof cachedResource.metadata.dateCreated !== 'number') {
                        logger_util_1.CorrelatedLogger.warn(`Corrupted cache data found, deleting: ${this.id}`, CacheImageResourceOperation_1.name);
                        await this.cacheManager.delete('image', this.id);
                    }
                    else {
                        const isValid = cachedResource.metadata.dateCreated + cachedResource.metadata.privateTTL > Date.now();
                        if (isValid) {
                            logger_util_1.CorrelatedLogger.debug(`Resource found in cache and is valid: ${this.id}`, CacheImageResourceOperation_1.name);
                            const duration = performance_tracker_util_1.PerformanceTracker.endPhase('resource_exists_check');
                            this.metricsService.recordCacheOperation('get', 'multi-layer', 'hit', duration || 0);
                            return true;
                        }
                        else {
                            logger_util_1.CorrelatedLogger.debug(`Resource found in cache but expired: ${this.id}`, CacheImageResourceOperation_1.name);
                            await this.cacheManager.delete('image', this.id);
                        }
                    }
                }
                const resourcePathExists = await (0, promises_1.access)(this.getResourcePath).then(() => true).catch(() => false);
                if (!resourcePathExists) {
                    logger_util_1.CorrelatedLogger.debug(`Resource not found in filesystem: ${this.getResourcePath}`, CacheImageResourceOperation_1.name);
                    const duration = performance_tracker_util_1.PerformanceTracker.endPhase('resource_exists_check');
                    this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss', duration || 0);
                    return false;
                }
                const resourceMetaPathExists = await (0, promises_1.access)(this.getResourceMetaPath).then(() => true).catch(() => false);
                if (!resourceMetaPathExists) {
                    logger_util_1.CorrelatedLogger.warn(`Metadata path does not exist: ${this.getResourceMetaPath}`, CacheImageResourceOperation_1.name);
                    const duration = performance_tracker_util_1.PerformanceTracker.endPhase('resource_exists_check');
                    this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss', duration || 0);
                    return false;
                }
                const headers = await this.getHeaders;
                if (!headers) {
                    logger_util_1.CorrelatedLogger.warn('Metadata headers are missing or invalid', CacheImageResourceOperation_1.name);
                    const duration = performance_tracker_util_1.PerformanceTracker.endPhase('resource_exists_check');
                    this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss', duration || 0);
                    return false;
                }
                if (!headers.version || headers.version !== 1) {
                    logger_util_1.CorrelatedLogger.warn('Invalid or missing version in metadata', CacheImageResourceOperation_1.name);
                    const duration = performance_tracker_util_1.PerformanceTracker.endPhase('resource_exists_check');
                    this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss', duration || 0);
                    return false;
                }
                const isValid = headers.dateCreated + headers.privateTTL > Date.now();
                const duration = performance_tracker_util_1.PerformanceTracker.endPhase('resource_exists_check');
                this.metricsService.recordCacheOperation('get', 'multi-layer', isValid ? 'hit' : 'miss', duration || 0);
                return isValid;
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Error checking resource existence: ${error.message}`, CacheImageResourceOperation_1.name);
                this.metricsService.recordError('cache_check', 'resource_exists');
                const duration = performance_tracker_util_1.PerformanceTracker.endPhase('resource_exists_check');
                this.metricsService.recordCacheOperation('get', 'multi-layer', 'error', duration || 0);
                return false;
            }
        })();
    }
    get getHeaders() {
        return (async () => {
            if (!this.metaData) {
                try {
                    const cachedResource = await this.getCachedResource();
                    if (cachedResource && cachedResource.metadata) {
                        this.metaData = cachedResource.metadata;
                        return this.metaData;
                    }
                    const exists = await (0, promises_1.access)(this.getResourceMetaPath).then(() => true).catch(() => false);
                    if (exists) {
                        const content = await (0, promises_1.readFile)(this.getResourceMetaPath, 'utf8');
                        this.metaData = new resource_meta_data_dto_1.default(JSON.parse(content));
                    }
                    else {
                        logger_util_1.CorrelatedLogger.warn('Metadata file does not exist.', CacheImageResourceOperation_1.name);
                        return new resource_meta_data_dto_1.default();
                    }
                }
                catch (error) {
                    logger_util_1.CorrelatedLogger.error(`Failed to read or parse resource metadata: ${error}`, '', CacheImageResourceOperation_1.name);
                    return new resource_meta_data_dto_1.default();
                }
            }
            return this.metaData;
        })();
    }
    async setup(cacheImageRequest) {
        performance_tracker_util_1.PerformanceTracker.startPhase('setup');
        try {
            logger_util_1.CorrelatedLogger.debug('Setting up cache image resource operation', CacheImageResourceOperation_1.name);
            this.request = await this.inputSanitizationService.sanitize(cacheImageRequest);
            if (this.request.resourceTarget && !this.inputSanitizationService.validateUrl(this.request.resourceTarget)) {
                throw new Error(`Invalid or disallowed URL: ${this.request.resourceTarget}`);
            }
            if (this.request.resizeOptions?.width && this.request.resizeOptions?.height) {
                if (!this.inputSanitizationService.validateImageDimensions(this.request.resizeOptions.width, this.request.resizeOptions.height)) {
                    throw new Error(`Invalid image dimensions: ${this.request.resizeOptions.width}x${this.request.resizeOptions.height}`);
                }
            }
            await this.validateCacheImageRequest.setup(this.request);
            await this.validateCacheImageRequest.apply();
            this.id = await this.generateResourceIdentityFromRequestJob.handle(this.request);
            this.metaData = null;
            logger_util_1.CorrelatedLogger.debug(`Resource ID generated: ${this.id}`, CacheImageResourceOperation_1.name);
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Setup failed: ${error.message}`, error.stack, CacheImageResourceOperation_1.name);
            this.metricsService.recordError('validation', 'setup');
            throw error;
        }
        finally {
            performance_tracker_util_1.PerformanceTracker.endPhase('setup');
        }
    }
    async execute() {
        performance_tracker_util_1.PerformanceTracker.startPhase('execute');
        try {
            logger_util_1.CorrelatedLogger.debug('Executing cache image resource operation', CacheImageResourceOperation_1.name);
            if (await this.resourceExists) {
                logger_util_1.CorrelatedLogger.log('Resource already exists in cache', CacheImageResourceOperation_1.name);
                const duration = performance_tracker_util_1.PerformanceTracker.endPhase('execute');
                this.metricsService.recordImageProcessing('cache_check', 'cached', 'success', duration || 0);
                return;
            }
            const shouldUseQueue = this.shouldUseBackgroundProcessing();
            if (shouldUseQueue) {
                logger_util_1.CorrelatedLogger.debug('Queuing image processing job for background processing', CacheImageResourceOperation_1.name);
                await this.queueImageProcessing();
                return;
            }
            await this.processImageSynchronously();
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Failed to execute CacheImageResourceOperation: ${error.message}`, error.stack, CacheImageResourceOperation_1.name);
            this.metricsService.recordError('image_processing', 'execute');
            const duration = performance_tracker_util_1.PerformanceTracker.endPhase('execute');
            this.metricsService.recordImageProcessing('execute', 'unknown', 'error', duration || 0);
            throw new common_1.InternalServerErrorException('Error fetching or processing image.');
        }
        finally {
            performance_tracker_util_1.PerformanceTracker.endPhase('execute');
        }
    }
    shouldUseBackgroundProcessing() {
        return false;
    }
    async queueImageProcessing() {
        const priority = this.request.resizeOptions?.width && this.request.resizeOptions.width > 1920
            ? job_types_1.JobPriority.LOW
            : job_types_1.JobPriority.NORMAL;
        await this.jobQueueManager.addImageProcessingJob({
            imageUrl: this.request.resourceTarget,
            width: this.request.resizeOptions?.width ?? undefined,
            height: this.request.resizeOptions?.height ?? undefined,
            quality: this.request.resizeOptions?.quality,
            format: this.request.resizeOptions?.format,
            fit: this.request.resizeOptions?.fit,
            position: this.request.resizeOptions?.position,
            background: this.request.resizeOptions?.background,
            trimThreshold: this.request.resizeOptions?.trimThreshold ?? undefined,
            cacheKey: this.id,
            priority,
        });
        logger_util_1.CorrelatedLogger.debug(`Image processing job queued with priority: ${priority}`, CacheImageResourceOperation_1.name);
    }
    async processImageSynchronously() {
        performance_tracker_util_1.PerformanceTracker.startPhase('sync_processing');
        try {
            const response = await this.fetchResourceResponseJob.handle(this.request);
            if (!response || response.status === 404) {
                throw new unable_to_fetch_resource_exception_1.default(this.request.resourceTarget);
            }
            const contentLength = response.headers['content-length'];
            if (contentLength) {
                const sizeBytes = Number.parseInt(contentLength, 10);
                const format = this.getFormatFromUrl(this.request.resourceTarget);
                if (!this.inputSanitizationService.validateFileSize(sizeBytes, format)) {
                    throw new Error(`File size ${sizeBytes} bytes exceeds limit for format ${format}`);
                }
            }
            await this.storeResourceResponseToFileJob.handle(this.request.resourceTarget, this.getResourceTempPath, response);
            let processedData;
            let metadata;
            let isSourceSvg = false;
            try {
                const fileContent = await (0, promises_1.readFile)(this.getResourceTempPath, 'utf8');
                isSourceSvg = fileContent.trim().startsWith('<svg') || fileContent.includes('xmlns="http://www.w3.org/2000/svg"');
                logger_util_1.CorrelatedLogger.debug(`Source file SVG detection: ${isSourceSvg}`, CacheImageResourceOperation_1.name);
            }
            catch {
                isSourceSvg = false;
                logger_util_1.CorrelatedLogger.debug('Could not read file as text, assuming not SVG', CacheImageResourceOperation_1.name);
            }
            if (isSourceSvg) {
                const result = await this.processSvgImage();
                processedData = result.data;
                metadata = result.metadata;
            }
            else {
                const result = await this.processRasterImage();
                processedData = result.data;
                metadata = result.metadata;
            }
            await this.cacheManager.set('image', this.id, {
                data: processedData,
                metadata,
            }, metadata.privateTTL);
            await (0, promises_1.writeFile)(this.getResourcePath, processedData);
            await (0, promises_1.writeFile)(this.getResourceMetaPath, JSON.stringify(metadata), 'utf8');
            try {
                await (0, promises_1.unlink)(this.getResourceTempPath);
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Failed to delete temporary file: ${error.message}`, CacheImageResourceOperation_1.name);
            }
            const format = metadata.format || 'unknown';
            const duration = performance_tracker_util_1.PerformanceTracker.endPhase('sync_processing');
            this.metricsService.recordImageProcessing('process', format, 'success', duration || 0);
            logger_util_1.CorrelatedLogger.debug(`Image processed successfully: ${this.id}`, CacheImageResourceOperation_1.name);
        }
        catch (error) {
            const duration = performance_tracker_util_1.PerformanceTracker.endPhase('sync_processing');
            this.metricsService.recordImageProcessing('process', 'unknown', 'error', duration || 0);
            throw error;
        }
    }
    async processSvgImage() {
        logger_util_1.CorrelatedLogger.debug('Processing SVG format', CacheImageResourceOperation_1.name);
        const svgContent = await (0, promises_1.readFile)(this.getResourceTempPath, 'utf8');
        if (!svgContent.toLowerCase().includes('<svg')) {
            logger_util_1.CorrelatedLogger.warn('The file is not a valid SVG. Serving default WebP image.', CacheImageResourceOperation_1.name);
            return await this.processDefaultImage();
        }
        const needsResizing = (this.request.resizeOptions?.width !== null && !Number.isNaN(this.request.resizeOptions?.width))
            || (this.request.resizeOptions?.height !== null && !Number.isNaN(this.request.resizeOptions?.height));
        if (!needsResizing) {
            const data = node_buffer_1.Buffer.from(svgContent, 'utf8');
            const metadata = new resource_meta_data_dto_1.default({
                version: 1,
                size: data.length.toString(),
                format: 'svg',
                dateCreated: Date.now(),
                publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
            });
            return { data, metadata };
        }
        else {
            logger_util_1.CorrelatedLogger.debug('SVG needs resizing, converting to PNG for better quality', CacheImageResourceOperation_1.name);
            const result = await this.webpImageManipulationJob.handle(this.getResourceTempPath, this.getResourcePath, this.request.resizeOptions);
            const data = await (0, promises_1.readFile)(this.getResourcePath);
            const metadata = new resource_meta_data_dto_1.default({
                version: 1,
                size: result.size,
                format: result.format,
                dateCreated: Date.now(),
                publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
            });
            return { data, metadata };
        }
    }
    async processRasterImage() {
        const result = await this.webpImageManipulationJob.handle(this.getResourceTempPath, this.getResourcePath, this.request.resizeOptions);
        logger_util_1.CorrelatedLogger.debug(`processRasterImage received result: ${JSON.stringify(result)}`, 'CacheImageResourceOperation');
        const data = await (0, promises_1.readFile)(this.getResourcePath);
        const actualFormat = result.format;
        const requestedFormat = this.request.resizeOptions?.format;
        if (requestedFormat === 'svg' && result.format !== 'svg') {
            logger_util_1.CorrelatedLogger.debug(`SVG format requested but actual format is ${result.format}. Using actual format for content-type.`, 'CacheImageResourceOperation');
        }
        const metadata = new resource_meta_data_dto_1.default({
            version: 1,
            size: result.size,
            format: actualFormat,
            dateCreated: Date.now(),
            publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
            privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
        });
        logger_util_1.CorrelatedLogger.debug(`processRasterImage created metadata: ${JSON.stringify(metadata)}`, 'CacheImageResourceOperation');
        return { data, metadata };
    }
    async processDefaultImage() {
        const optimizedPath = await this.optimizeAndServeDefaultImage(this.request.resizeOptions);
        const data = await (0, promises_1.readFile)(optimizedPath);
        const metadata = new resource_meta_data_dto_1.default({
            version: 1,
            size: data.length.toString(),
            format: 'webp',
            dateCreated: Date.now(),
            publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
            privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
        });
        return { data, metadata };
    }
    getFormatFromUrl(url) {
        const extension = url.split('.').pop()?.toLowerCase();
        return extension || 'unknown';
    }
    async optimizeAndServeDefaultImage(resizeOptions) {
        const resizeOptionsWithDefaults = {
            width: resizeOptions.width || 800,
            height: resizeOptions.height || 600,
            fit: resizeOptions.fit || cache_image_request_dto_1.FitOptions.contain,
            position: resizeOptions.position || cache_image_request_dto_1.PositionOptions.entropy,
            format: resizeOptions.format || cache_image_request_dto_1.SupportedResizeFormats.webp,
            background: resizeOptions.background || cache_image_request_dto_1.BackgroundOptions.white,
            trimThreshold: resizeOptions.trimThreshold || 5,
            quality: resizeOptions.quality || 100,
        };
        const optionsString = this.createOptionsString(resizeOptionsWithDefaults);
        const optimizedPath = path.join(this.basePath, 'storage', `default_optimized_${optionsString}.webp`);
        try {
            await (0, promises_1.access)(optimizedPath);
            return optimizedPath;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                const result = await this.webpImageManipulationJob.handle(path.join(this.basePath, 'public', 'default.png'), optimizedPath, resizeOptionsWithDefaults);
                if (!result) {
                    throw new Error('Failed to optimize default image');
                }
                return optimizedPath;
            }
            throw error;
        }
    }
    createOptionsString(options) {
        const hash = (0, node_crypto_1.createHash)('md5');
        hash.update(JSON.stringify(options));
        return hash.digest('hex');
    }
    async getCachedResource() {
        performance_tracker_util_1.PerformanceTracker.startPhase('get_cached_resource');
        try {
            let cachedResource = await this.cacheManager.get('image', this.id);
            if (cachedResource && (!cachedResource.metadata || typeof cachedResource.metadata.dateCreated !== 'number')) {
                logger_util_1.CorrelatedLogger.warn(`Corrupted cache data found in getCachedResource, deleting: ${this.id}`, CacheImageResourceOperation_1.name);
                await this.cacheManager.delete('image', this.id);
                cachedResource = null;
            }
            if (!cachedResource) {
                const cachedData = await this.cacheManager.get('images', this.id);
                if (cachedData) {
                    const metadata = new resource_meta_data_dto_1.default({
                        version: 1,
                        size: node_buffer_1.Buffer.from(cachedData, 'base64').length.toString(),
                        format: this.request.resizeOptions?.format || 'webp',
                        dateCreated: Date.now(),
                        publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                        privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
                    });
                    cachedResource = {
                        data: node_buffer_1.Buffer.from(cachedData, 'base64'),
                        metadata,
                    };
                }
            }
            if (cachedResource) {
                logger_util_1.CorrelatedLogger.debug(`Resource retrieved from cache: ${this.id}`, CacheImageResourceOperation_1.name);
                const duration = performance_tracker_util_1.PerformanceTracker.endPhase('get_cached_resource');
                this.metricsService.recordCacheOperation('get', 'multi-layer', 'hit', duration || 0);
                return cachedResource;
            }
            const resourceExists = await (0, promises_1.access)(this.getResourcePath).then(() => true).catch(() => false);
            const metadataExists = await (0, promises_1.access)(this.getResourceMetaPath).then(() => true).catch(() => false);
            if (resourceExists && metadataExists) {
                const data = await (0, promises_1.readFile)(this.getResourcePath);
                const metadataContent = await (0, promises_1.readFile)(this.getResourceMetaPath, 'utf8');
                const metadata = new resource_meta_data_dto_1.default(JSON.parse(metadataContent));
                await this.cacheManager.set('image', this.id, { data, metadata }, metadata.privateTTL);
                logger_util_1.CorrelatedLogger.debug(`Resource retrieved from filesystem and cached: ${this.id}`, CacheImageResourceOperation_1.name);
                const duration = performance_tracker_util_1.PerformanceTracker.endPhase('get_cached_resource');
                this.metricsService.recordCacheOperation('get', 'filesystem', 'hit', duration || 0);
                return { data, metadata };
            }
            logger_util_1.CorrelatedLogger.debug(`Resource not found: ${this.id}`, CacheImageResourceOperation_1.name);
            const duration = performance_tracker_util_1.PerformanceTracker.endPhase('get_cached_resource');
            this.metricsService.recordCacheOperation('get', 'multi-layer', 'miss', duration || 0);
            return null;
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Failed to get cached resource: ${error.message}`, error.stack, CacheImageResourceOperation_1.name);
            this.metricsService.recordError('cache_retrieval', 'get_cached_resource');
            const duration = performance_tracker_util_1.PerformanceTracker.endPhase('get_cached_resource');
            this.metricsService.recordCacheOperation('get', 'multi-layer', 'error', duration || 0);
            return null;
        }
    }
};
CacheImageResourceOperation = CacheImageResourceOperation_1 = __decorate([
    (0, common_1.Injectable)({ scope: common_1.Scope.REQUEST }),
    __metadata("design:paramtypes", [validate_cache_image_request_rule_1.default,
        fetch_resource_response_job_1.default,
        webp_image_manipulation_job_1.default,
        store_resource_response_to_file_job_1.default,
        generate_resource_identity_from_request_job_1.default,
        multi_layer_cache_manager_1.MultiLayerCacheManager,
        input_sanitization_service_1.InputSanitizationService,
        job_queue_manager_1.JobQueueManager,
        metrics_service_1.MetricsService])
], CacheImageResourceOperation);
exports.default = CacheImageResourceOperation;
//# sourceMappingURL=cache-image-resource.operation.js.map