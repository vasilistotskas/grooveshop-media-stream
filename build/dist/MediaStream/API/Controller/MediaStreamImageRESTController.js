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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const fs_1 = require("fs");
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const RoutePrefixes_1 = require("../../Constant/RoutePrefixes");
const CacheImageResourceOperation_1 = __importDefault(require("../../Operation/CacheImageResourceOperation"));
const CacheImageRequest_1 = __importStar(require("../DTO/CacheImageRequest"));
const GenerateResourceIdentityFromRequestJob_1 = __importDefault(require("../../Job/GenerateResourceIdentityFromRequestJob"));
const process = __importStar(require("process"));
let MediaStreamImageRESTController = MediaStreamImageRESTController_1 = class MediaStreamImageRESTController {
    constructor(httpService, generateResourceIdentityFromRequestJob, cacheImageResourceOperation) {
        this.httpService = httpService;
        this.generateResourceIdentityFromRequestJob = generateResourceIdentityFromRequestJob;
        this.cacheImageResourceOperation = cacheImageResourceOperation;
        this.logger = new common_1.Logger(MediaStreamImageRESTController_1.name);
    }
    static addHeadersToRequest(res, headers) {
        const expiresAt = Date.now() + headers.publicTTL;
        return res
            .header('Content-Type', `image/${headers.format}`)
            .header('Content-Length', headers.size.toString())
            .header('Cache-Control', `max-age=${headers.publicTTL / 1000}, public`)
            .header('Expires', new Date(expiresAt).toUTCString());
    }
    async streamRequestedResource(request, res) {
        await this.cacheImageResourceOperation.setup(request);
        if (this.cacheImageResourceOperation.resourceExists) {
            const headers = this.cacheImageResourceOperation.getHeaders;
            res = MediaStreamImageRESTController_1.addHeadersToRequest(res, headers);
            const stream = (0, fs_1.createReadStream)(this.cacheImageResourceOperation.getResourcePath).pipe(res);
            try {
                await new Promise((resolve, reject) => {
                    stream.on('finish', () => resolve);
                    stream.on('error', () => reject);
                });
            }
            catch (e) {
                this.logger.error(e);
            }
            finally {
                await this.cacheImageResourceOperation.execute();
            }
        }
        else {
            try {
                await this.cacheImageResourceOperation.execute();
                const headers = this.cacheImageResourceOperation.getHeaders;
                res = MediaStreamImageRESTController_1.addHeadersToRequest(res, headers);
                (0, fs_1.createReadStream)(this.cacheImageResourceOperation.getResourcePath).pipe(res);
            }
            catch (e) {
                this.logger.warn(e);
                await this.defaultImageFallback(request, res);
            }
        }
    }
    async defaultImageFallback(request, res) {
        try {
            const optimizedDefaultImagePath = await this.cacheImageResourceOperation.optimizeAndServeDefaultImage(request.resizeOptions);
            res.sendFile(optimizedDefaultImagePath);
        }
        catch (defaultImageError) {
            this.logger.error('Failed to serve default image', defaultImageError);
            throw new common_1.InternalServerErrorException('Failed to process the image request.');
        }
    }
    static resourceTargetPrepare(resourceTarget) {
        return resourceTarget;
    }
    async uploadedImage(imageType, image, width = null, height = null, fit = CacheImageRequest_1.FitOptions.contain, position = CacheImageRequest_1.PositionOptions.entropy, background = CacheImageRequest_1.BackgroundOptions.transparent, trimThreshold = 5, format = CacheImageRequest_1.SupportedResizeFormats.webp, quality = 100, res) {
        const resizeOptions = new CacheImageRequest_1.ResizeOptions({
            width,
            height,
            position,
            background,
            fit,
            trimThreshold,
            format,
            quality
        });
        const djangoApiUrl = process.env.NEST_PUBLIC_DJANGO_URL || 'http://localhost:8000';
        const request = new CacheImageRequest_1.default({
            resourceTarget: MediaStreamImageRESTController_1.resourceTargetPrepare(`${djangoApiUrl}/media/uploads/${imageType}/${image}`),
            resizeOptions: resizeOptions
        });
        await this.streamRequestedResource(request, res);
    }
    async staticImage(image, width = null, height = null, fit = CacheImageRequest_1.FitOptions.contain, position = CacheImageRequest_1.PositionOptions.entropy, background = CacheImageRequest_1.BackgroundOptions.transparent, trimThreshold = 5, format = CacheImageRequest_1.SupportedResizeFormats.webp, quality = 100, res) {
        const djangoApiUrl = process.env.NEST_PUBLIC_DJANGO_URL || 'http://localhost:8000';
        const request = new CacheImageRequest_1.default({
            resourceTarget: MediaStreamImageRESTController_1.resourceTargetPrepare(`${djangoApiUrl}/static/images/${image}`),
            resizeOptions: new CacheImageRequest_1.ResizeOptions({
                width,
                height,
                position,
                background,
                fit,
                trimThreshold,
                format,
                quality
            })
        });
        await this.streamRequestedResource(request, res);
    }
    async publicNuxtImage(image, width = null, height = null, fit = CacheImageRequest_1.FitOptions.contain, position = CacheImageRequest_1.PositionOptions.entropy, background = CacheImageRequest_1.BackgroundOptions.transparent, trimThreshold = 5, format = CacheImageRequest_1.SupportedResizeFormats.webp, quality = 100, res) {
        const nuxtPublicUrl = process.env.NEST_PUBLIC_NUXT_URL || 'http://localhost:3000';
        const request = new CacheImageRequest_1.default({
            resourceTarget: MediaStreamImageRESTController_1.resourceTargetPrepare(`${nuxtPublicUrl}/img/${image}`),
            resizeOptions: new CacheImageRequest_1.ResizeOptions({
                width,
                height,
                position,
                background,
                fit,
                trimThreshold,
                format,
                quality
            })
        });
        await this.streamRequestedResource(request, res);
    }
};
__decorate([
    (0, common_1.Get)('media/uploads/:imageType/:image/:width?/:height?/:fit?/:position?/:background?/:trimThreshold?/:format?/:quality?'),
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
    (0, common_1.Get)('static/images/:image/:width?/:height?/:fit?/:position?/:background?/:trimThreshold?/:format?/:quality?'),
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
__decorate([
    (0, common_1.Get)('img/:image/:width?/:height?/:fit?/:position?/:background?/:trimThreshold?/:format?/:quality?'),
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
], MediaStreamImageRESTController.prototype, "publicNuxtImage", null);
MediaStreamImageRESTController = MediaStreamImageRESTController_1 = __decorate([
    (0, common_1.Controller)({
        path: RoutePrefixes_1.IMAGE,
        version: RoutePrefixes_1.VERSION,
        scope: common_1.Scope.REQUEST
    }),
    __metadata("design:paramtypes", [axios_1.HttpService,
        GenerateResourceIdentityFromRequestJob_1.default,
        CacheImageResourceOperation_1.default])
], MediaStreamImageRESTController);
exports.default = MediaStreamImageRESTController;
//# sourceMappingURL=MediaStreamImageRESTController.js.map