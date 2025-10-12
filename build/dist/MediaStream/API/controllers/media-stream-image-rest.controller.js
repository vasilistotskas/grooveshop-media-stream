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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var MediaStreamImageRESTController_1;
Object.defineProperty(exports, "__esModule", { value: true });
const node_buffer_1 = require("node:buffer");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const process = __importStar(require("node:process"));
const cache_image_request_dto_1 = __importStar(require("../dto/cache-image-request.dto"));
const cache_image_resource_operation_1 = __importDefault(require("../../Cache/operations/cache-image-resource.operation"));
const route_prefixes_constant_1 = require("../../common/constants/route-prefixes.constant");
const media_stream_errors_1 = require("../../common/errors/media-stream.errors");
const correlation_service_1 = require("../../Correlation/services/correlation.service");
const performance_tracker_util_1 = require("../../Correlation/utils/performance-tracker.util");
const metrics_service_1 = require("../../Metrics/services/metrics.service");
const adaptive_rate_limit_guard_1 = require("../../RateLimit/guards/adaptive-rate-limit.guard");
const input_sanitization_service_1 = require("../../Validation/services/input-sanitization.service");
const security_checker_service_1 = require("../../Validation/services/security-checker.service");
const common_1 = require("@nestjs/common");
let MediaStreamImageRESTController = MediaStreamImageRESTController_1 = class MediaStreamImageRESTController {
    constructor(cacheImageResourceOperation, inputSanitizationService, securityCheckerService, _correlationService, metricsService) {
        this.cacheImageResourceOperation = cacheImageResourceOperation;
        this.inputSanitizationService = inputSanitizationService;
        this.securityCheckerService = securityCheckerService;
        this._correlationService = _correlationService;
        this.metricsService = metricsService;
        this._logger = new common_1.Logger(MediaStreamImageRESTController_1.name);
    }
    async validateRequestParameters(params) {
        const correlationId = this._correlationService.getCorrelationId();
        if (params.imageType) {
            const isMalicious = await this.securityCheckerService.checkForMaliciousContent(params.imageType);
            if (isMalicious) {
                throw new media_stream_errors_1.InvalidRequestError('Invalid imageType parameter', {
                    correlationId,
                    imageType: params.imageType,
                });
            }
        }
        if (params.image) {
            const isMalicious = await this.securityCheckerService.checkForMaliciousContent(params.image);
            if (isMalicious) {
                throw new media_stream_errors_1.InvalidRequestError('Invalid image parameter', {
                    correlationId,
                    image: params.image,
                });
            }
        }
        if (params.width !== null && params.width !== undefined) {
            const width = Number(params.width);
            if (Number.isNaN(width) || width < 1 || width > 5000) {
                throw new media_stream_errors_1.InvalidRequestError('Invalid width parameter', {
                    correlationId,
                    width: params.width,
                });
            }
        }
        if (params.height !== null && params.height !== undefined) {
            const height = Number(params.height);
            if (Number.isNaN(height) || height < 1 || height > 5000) {
                throw new media_stream_errors_1.InvalidRequestError('Invalid height parameter', {
                    correlationId,
                    height: params.height,
                });
            }
        }
        if (params.quality !== undefined) {
            const quality = Number(params.quality);
            if (Number.isNaN(quality) || quality < 1 || quality > 100) {
                throw new media_stream_errors_1.InvalidRequestError('Invalid quality parameter', {
                    correlationId,
                    quality: params.quality,
                });
            }
        }
        if (params.trimThreshold !== undefined) {
            const trimThreshold = Number(params.trimThreshold);
            if (Number.isNaN(trimThreshold) || trimThreshold < 0 || trimThreshold > 100) {
                throw new media_stream_errors_1.InvalidRequestError('Invalid trimThreshold parameter', {
                    correlationId,
                    trimThreshold: params.trimThreshold,
                });
            }
        }
    }
    generateETag(input) {
        const hash = (0, node_crypto_1.createHash)('md5');
        hash.update(node_buffer_1.Buffer.isBuffer(input) ? input : node_buffer_1.Buffer.from(input));
        return `"${hash.digest('hex')}"`;
    }
    addHeadersToRequest(res, headers, etag) {
        if (!headers) {
            const correlationId = this._correlationService.getCorrelationId();
            throw new media_stream_errors_1.InvalidRequestError('Headers object is undefined', {
                headers,
                correlationId,
            });
        }
        const size = headers.size !== undefined ? headers.size.toString() : '0';
        const format = headers.format || 'png';
        const publicTTL = headers.publicTTL || 0;
        const expiresAt = Date.now() + publicTTL;
        const correlationId = this._correlationService.getCorrelationId();
        res
            .header('Content-Length', size)
            .header('Cache-Control', `max-age=${publicTTL / 1000}, public, immutable`)
            .header('Expires', new Date(expiresAt).toUTCString())
            .header('X-Correlation-ID', correlationId || 'unknown')
            .header('Vary', 'Accept-Encoding');
        if (etag) {
            res.header('ETag', etag);
        }
        if (format === 'svg') {
            res.header('Content-Type', 'image/svg+xml');
        }
        else {
            res.header('Content-Type', `image/${format}`);
        }
        return res;
    }
    async handleStreamOrFallback(request, res) {
        const correlationId = this._correlationService.getCorrelationId();
        performance_tracker_util_1.PerformanceTracker.startPhase('image_request_processing');
        try {
            this.metricsService.recordError('image_requests', 'total');
            await this.cacheImageResourceOperation.setup(request);
            if (await this.cacheImageResourceOperation.resourceExists) {
                this._logger.debug('Resource exists, attempting to stream.', {
                    request,
                    correlationId,
                });
                await this.streamResource(request, res);
            }
            else {
                this._logger.debug('Resource does not exist, attempting to fetch or fallback to default.', {
                    request,
                    correlationId,
                });
                const shouldUseQueue = this.cacheImageResourceOperation.shouldUseBackgroundProcessing
                    && this.cacheImageResourceOperation.shouldUseBackgroundProcessing();
                await this.cacheImageResourceOperation.execute();
                const maxWaitTime = shouldUseQueue ? 3000 : 10000;
                const pollInterval = 100;
                let waitTime = 0;
                while (waitTime < maxWaitTime) {
                    if (await this.cacheImageResourceOperation.resourceExists) {
                        this._logger.debug('Resource became available after waiting', {
                            waitTime,
                            correlationId,
                        });
                        await this.streamResource(request, res);
                        return;
                    }
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                    waitTime += pollInterval;
                }
                if (waitTime >= maxWaitTime) {
                    this._logger.warn('Timeout waiting for resource to be processed', {
                        waitTime,
                        correlationId,
                        wasQueued: shouldUseQueue,
                    });
                }
                await this.defaultImageFallback(request, res);
            }
        }
        catch (error) {
            const context = { request, error, correlationId };
            const errorMessage = error.message || '';
            if (errorMessage.includes('Circuit breaker is open')) {
                this._logger.warn('Circuit breaker is open, serving fallback immediately', context);
                this.metricsService.recordError('image_request', 'circuit_breaker_open');
            }
            else {
                this._logger.error(`Error while processing the image request: ${errorMessage}`, error, context);
                const errorName = error instanceof Error ? error.constructor.name : 'UnknownError';
                this.metricsService.recordError('image_request', errorName);
            }
            await this.defaultImageFallback(request, res);
        }
        finally {
            performance_tracker_util_1.PerformanceTracker.endPhase('image_request_processing');
        }
    }
    async streamFileToResponse(filePath, headers, res) {
        const correlationId = this._correlationService.getCorrelationId();
        performance_tracker_util_1.PerformanceTracker.startPhase('file_streaming');
        let fd = null;
        try {
            this._logger.debug(`Streaming file: ${filePath}`, {
                filePath,
                headers,
                correlationId,
            });
            fd = await (0, promises_1.open)(filePath, 'r');
            res = this.addHeadersToRequest(res, headers);
            const fileStream = fd.createReadStream();
            if (typeof res.on === 'function') {
                fileStream.pipe(res);
                await new Promise((resolve, reject) => {
                    fileStream.on('end', () => {
                        resolve();
                    });
                    fileStream.on('error', (error) => {
                        const context = { filePath, headers, error, correlationId };
                        this._logger.error(`Stream error: ${error.message || error}`, error, context);
                        this.metricsService.recordError('file_stream', 'stream_error');
                        reject(new media_stream_errors_1.ResourceStreamingError('Error streaming file', context));
                    });
                    res.on('close', () => {
                        fileStream.destroy();
                        resolve();
                    });
                });
            }
            else {
                throw new media_stream_errors_1.InvalidRequestError('Response object is not a writable stream', {
                    filePath,
                    headers,
                    correlationId,
                });
            }
        }
        catch (error) {
            if (error.name !== 'ResourceStreamingError') {
                throw new media_stream_errors_1.ResourceStreamingError('Failed to stream file', {
                    filePath,
                    error: error.message || error,
                    correlationId,
                });
            }
            throw error;
        }
        finally {
            performance_tracker_util_1.PerformanceTracker.endPhase('file_streaming');
            if (fd) {
                await fd.close().catch((err) => {
                    this._logger.error(`Error closing file descriptor: ${err.message || err}`, err, {
                        filePath,
                        correlationId,
                    });
                });
            }
        }
    }
    async streamResource(request, res) {
        const correlationId = this._correlationService.getCorrelationId();
        const headers = await this.cacheImageResourceOperation.getHeaders;
        if (!headers) {
            this._logger.warn('Resource metadata is missing or invalid.', {
                request,
                correlationId,
            });
            await this.defaultImageFallback(request, res);
            return;
        }
        try {
            const cachedResource = await this.cacheImageResourceOperation.getCachedResource();
            if (cachedResource && cachedResource.data) {
                res = this.addHeadersToRequest(res, headers);
                let imageData;
                if (typeof cachedResource.data === 'string') {
                    imageData = node_buffer_1.Buffer.from(cachedResource.data, 'base64');
                }
                else if (node_buffer_1.Buffer.isBuffer(cachedResource.data)) {
                    imageData = cachedResource.data;
                }
                else if (cachedResource.data && typeof cachedResource.data === 'object' && 'data' in cachedResource.data) {
                    imageData = node_buffer_1.Buffer.from(cachedResource.data.data);
                }
                else {
                    this._logger.warn('Unexpected data type in cached resource, falling back to file streaming', {
                        dataType: typeof cachedResource.data,
                        correlationId: this._correlationService.getCorrelationId(),
                    });
                    await this.streamFileToResponse(this.cacheImageResourceOperation.getResourcePath, headers, res);
                    return;
                }
                res.end(imageData);
                return;
            }
            await this.streamFileToResponse(this.cacheImageResourceOperation.getResourcePath, headers, res);
        }
        catch (error) {
            const context = {
                request,
                resourcePath: this.cacheImageResourceOperation.getResourcePath,
                error: error.message || error,
                correlationId,
            };
            this._logger.error(`Error while streaming resource: ${error.message || error}`, error, context);
            await this.defaultImageFallback(request, res);
        }
        finally {
            await this.cacheImageResourceOperation.execute();
        }
    }
    async fetchAndStreamResource(request, res) {
        const correlationId = this._correlationService.getCorrelationId();
        try {
            await this.cacheImageResourceOperation.execute();
            if (this.cacheImageResourceOperation.shouldUseBackgroundProcessing && this.cacheImageResourceOperation.shouldUseBackgroundProcessing()) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            const headers = await this.cacheImageResourceOperation.getHeaders;
            if (!headers) {
                this._logger.warn('Failed to fetch resource or generate headers.', {
                    request,
                    correlationId,
                });
                await this.defaultImageFallback(request, res);
                return;
            }
            const cachedResource = await this.cacheImageResourceOperation.getCachedResource();
            if (cachedResource && cachedResource.data) {
                res = this.addHeadersToRequest(res, headers);
                const imageData = typeof cachedResource.data === 'string'
                    ? node_buffer_1.Buffer.from(cachedResource.data, 'base64')
                    : cachedResource.data;
                res.end(imageData);
                return;
            }
            await this.streamFileToResponse(this.cacheImageResourceOperation.getResourcePath, headers, res);
        }
        catch (error) {
            const context = {
                request,
                resourcePath: this.cacheImageResourceOperation.getResourcePath,
                error: error.message || error,
                correlationId,
            };
            this._logger.error(`Error during resource fetch and stream: ${error.message || error}`, error, context);
            await this.defaultImageFallback(request, res);
        }
    }
    async defaultImageFallback(request, res) {
        const correlationId = this._correlationService.getCorrelationId();
        try {
            const optimizedDefaultImagePath = await this.cacheImageResourceOperation.optimizeAndServeDefaultImage(request.resizeOptions);
            res.header('X-Correlation-ID', correlationId || 'unknown');
            res.sendFile(optimizedDefaultImagePath);
        }
        catch (defaultImageError) {
            const errorMessage = defaultImageError instanceof Error ? defaultImageError.message : String(defaultImageError);
            const context = {
                request,
                resizeOptions: request.resizeOptions,
                error: errorMessage,
                correlationId,
            };
            this._logger.error(`Failed to serve default image: ${errorMessage}`, defaultImageError, context);
            this.metricsService.recordError('default_image_fallback', 'fallback_error');
            throw new media_stream_errors_1.DefaultImageFallbackError('Failed to process the image request', context);
        }
    }
    static resourceTargetPrepare(resourceTarget) {
        return resourceTarget;
    }
    async uploadedImage(imageType, image, width = null, height = null, fit = cache_image_request_dto_1.FitOptions.contain, position = cache_image_request_dto_1.PositionOptions.entropy, background = cache_image_request_dto_1.BackgroundOptions.transparent, trimThreshold = 5, format = cache_image_request_dto_1.SupportedResizeFormats.webp, quality = 100, res) {
        const correlationId = this._correlationService.getCorrelationId();
        performance_tracker_util_1.PerformanceTracker.startPhase('uploaded_image_request');
        try {
            await this.validateRequestParameters({
                imageType,
                image,
                width,
                height,
                quality,
                trimThreshold,
            });
            const resizeOptions = new cache_image_request_dto_1.ResizeOptions({
                width: width ? Number(width) : null,
                height: height ? Number(height) : null,
                position,
                background,
                fit,
                trimThreshold: Number(trimThreshold),
                format,
                quality: Number(quality),
            });
            this._logger.debug(`Created ResizeOptions:`, {
                resizeOptions: JSON.stringify(resizeOptions, null, 2),
                correlationId,
            });
            const djangoApiUrl = process.env.NEST_PUBLIC_DJANGO_URL || 'http://localhost:8000';
            const resourceUrl = `${djangoApiUrl}/media/uploads/${imageType}/${image}`;
            const isValidUrl = this.inputSanitizationService.validateUrl(resourceUrl);
            if (!isValidUrl) {
                throw new media_stream_errors_1.InvalidRequestError('Invalid resource URL', {
                    correlationId,
                    resourceUrl,
                });
            }
            const request = new cache_image_request_dto_1.default({
                resourceTarget: MediaStreamImageRESTController_1.resourceTargetPrepare(resourceUrl),
                resizeOptions,
            });
            this._logger.debug(`Uploaded image request`, {
                request: {
                    imageType,
                    image,
                    width,
                    height,
                    format,
                    quality,
                },
                correlationId,
            });
            res.locals.requestedFormat = format;
            res.locals.originalUrl = resourceUrl;
            await this.handleStreamOrFallback(request, res);
        }
        catch (error) {
            const context = {
                imageType,
                image,
                width,
                height,
                format,
                quality,
                correlationId,
                error: error.message || error,
            };
            this._logger.error(`Error in uploadedImage: ${error.message || error}`, error, context);
            const errorName = error instanceof Error ? error.constructor.name : 'UnknownError';
            this.metricsService.recordError('uploaded_image_request', errorName);
            throw error;
        }
        finally {
            performance_tracker_util_1.PerformanceTracker.endPhase('uploaded_image_request');
        }
    }
    async staticImage(image, width = null, height = null, fit = cache_image_request_dto_1.FitOptions.contain, position = cache_image_request_dto_1.PositionOptions.entropy, background = cache_image_request_dto_1.BackgroundOptions.transparent, trimThreshold = 5, format = cache_image_request_dto_1.SupportedResizeFormats.webp, quality = 100, res) {
        const correlationId = this._correlationService.getCorrelationId();
        performance_tracker_util_1.PerformanceTracker.startPhase('static_image_request');
        try {
            await this.validateRequestParameters({
                image,
                width,
                height,
                quality,
                trimThreshold,
            });
            const djangoApiUrl = process.env.NEST_PUBLIC_DJANGO_URL || 'http://localhost:8000';
            const resourceUrl = `${djangoApiUrl}/static/images/${image}`;
            const isValidUrl = this.inputSanitizationService.validateUrl(resourceUrl);
            if (!isValidUrl) {
                throw new media_stream_errors_1.InvalidRequestError('Invalid resource URL', {
                    correlationId,
                    resourceUrl,
                });
            }
            const request = new cache_image_request_dto_1.default({
                resourceTarget: MediaStreamImageRESTController_1.resourceTargetPrepare(resourceUrl),
                resizeOptions: new cache_image_request_dto_1.ResizeOptions({
                    width: width ? Number(width) : null,
                    height: height ? Number(height) : null,
                    position,
                    background,
                    fit,
                    trimThreshold: Number(trimThreshold),
                    format,
                    quality: Number(quality),
                }),
            });
            this._logger.debug(`Static image request`, {
                request: {
                    image,
                    width,
                    height,
                    format,
                    quality,
                },
                correlationId,
            });
            res.locals.requestedFormat = format;
            res.locals.originalUrl = resourceUrl;
            await this.handleStreamOrFallback(request, res);
        }
        catch (error) {
            const context = {
                image,
                width,
                height,
                format,
                quality,
                correlationId,
                error: error.message || error,
            };
            this._logger.error(`Error in staticImage: ${error.message || error}`, error, context);
            const errorName = error instanceof Error ? error.constructor.name : 'UnknownError';
            this.metricsService.recordError('static_image_request', errorName);
            throw error;
        }
        finally {
            performance_tracker_util_1.PerformanceTracker.endPhase('static_image_request');
        }
    }
};
__decorate([
    (0, common_1.Get)('media/uploads/:imageType/:image/:width/:height/:fit/:position/:background/:trimThreshold/:format/:quality'),
    __param(0, (0, common_1.Param)('imageType')),
    __param(1, (0, common_1.Param)('image')),
    __param(2, (0, common_1.Param)('width')),
    __param(3, (0, common_1.Param)('height')),
    __param(4, (0, common_1.Param)('fit')),
    __param(5, (0, common_1.Param)('position')),
    __param(6, (0, common_1.Param)('background')),
    __param(7, (0, common_1.Param)('trimThreshold')),
    __param(8, (0, common_1.Param)('format')),
    __param(9, (0, common_1.Param)('quality')),
    __param(10, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number, String, Object, Object, Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], MediaStreamImageRESTController.prototype, "uploadedImage", null);
__decorate([
    (0, common_1.Get)('static/images/:image/:width/:height/:fit/:position/:background/:trimThreshold/:format/:quality'),
    __param(0, (0, common_1.Param)('image')),
    __param(1, (0, common_1.Param)('width')),
    __param(2, (0, common_1.Param)('height')),
    __param(3, (0, common_1.Param)('fit')),
    __param(4, (0, common_1.Param)('position')),
    __param(5, (0, common_1.Param)('background')),
    __param(6, (0, common_1.Param)('trimThreshold')),
    __param(7, (0, common_1.Param)('format')),
    __param(8, (0, common_1.Param)('quality')),
    __param(9, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number, String, Object, Object, Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], MediaStreamImageRESTController.prototype, "staticImage", null);
MediaStreamImageRESTController = MediaStreamImageRESTController_1 = __decorate([
    (0, common_1.Controller)({
        path: route_prefixes_constant_1.IMAGE,
        version: route_prefixes_constant_1.VERSION,
        scope: common_1.Scope.REQUEST,
    }),
    (0, common_1.UseGuards)(adaptive_rate_limit_guard_1.AdaptiveRateLimitGuard),
    __metadata("design:paramtypes", [cache_image_resource_operation_1.default,
        input_sanitization_service_1.InputSanitizationService,
        security_checker_service_1.SecurityCheckerService,
        correlation_service_1.CorrelationService,
        metrics_service_1.MetricsService])
], MediaStreamImageRESTController);
exports.default = MediaStreamImageRESTController;
//# sourceMappingURL=media-stream-image-rest.controller.js.map