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
const promises_1 = require("node:fs/promises");
const process = __importStar(require("node:process"));
const CacheImageRequest_1 = __importStar(require("../DTO/CacheImageRequest"));
const RoutePrefixes_1 = require("../../Constant/RoutePrefixes");
const GenerateResourceIdentityFromRequestJob_1 = __importDefault(require("../../Job/GenerateResourceIdentityFromRequestJob"));
const CacheImageResourceOperation_1 = __importDefault(require("../../Operation/CacheImageResourceOperation"));
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
let MediaStreamImageRESTController = MediaStreamImageRESTController_1 = class MediaStreamImageRESTController {
    constructor(httpService, generateResourceIdentityFromRequestJob, cacheImageResourceOperation) {
        this.httpService = httpService;
        this.generateResourceIdentityFromRequestJob = generateResourceIdentityFromRequestJob;
        this.cacheImageResourceOperation = cacheImageResourceOperation;
        this.logger = new common_1.Logger(MediaStreamImageRESTController_1.name);
    }
    static addHeadersToRequest(res, headers) {
        if (!headers) {
            throw new Error('Headers object is undefined');
        }
        const size = headers.size !== undefined ? headers.size.toString() : '0';
        const format = headers.format || 'png';
        const publicTTL = headers.publicTTL || 0;
        const expiresAt = Date.now() + publicTTL;
        res
            .header('Content-Length', size)
            .header('Cache-Control', `max-age=${publicTTL / 1000}, public`)
            .header('Expires', new Date(expiresAt).toUTCString());
        if (format === 'svg') {
            res.header('Content-Type', 'image/svg+xml');
        }
        else {
            res.header('Content-Type', `image/${format}`);
        }
        return res;
    }
    async handleStreamOrFallback(request, res) {
        try {
            await this.cacheImageResourceOperation.setup(request);
            if (await this.cacheImageResourceOperation.resourceExists) {
                this.logger.debug('Resource exists, attempting to stream.');
                await this.streamResource(request, res);
            }
            else {
                this.logger.debug('Resource does not exist, attempting to fetch or fallback to default.');
                await this.fetchAndStreamResource(request, res);
            }
        }
        catch (error) {
            this.logger.error(`Error while processing the image request: ${error}`);
            await this.defaultImageFallback(request, res);
        }
    }
    async streamResource(request, res) {
        const headers = await this.cacheImageResourceOperation.getHeaders;
        if (!headers) {
            this.logger.warn('Resource metadata is missing or invalid.');
            await this.defaultImageFallback(request, res);
            return;
        }
        try {
            this.logger.debug(`Checking if res is writable stream: ${typeof res.pipe}`);
            const fd = await (0, promises_1.open)(this.cacheImageResourceOperation.getResourcePath, 'r');
            res = MediaStreamImageRESTController_1.addHeadersToRequest(res, headers);
            const fileStream = fd.createReadStream();
            if (typeof res.on === 'function') {
                fileStream.pipe(res);
                await new Promise((resolve, reject) => {
                    fileStream.on('finish', resolve);
                    fileStream.on('error', (error) => {
                        this.logger.error(`Stream error: ${error}`);
                        reject(error);
                    });
                });
            }
            else {
                throw new TypeError('Response object is not a writable stream');
            }
        }
        catch (error) {
            this.logger.error(`Error while streaming resource: ${error}`);
            await this.defaultImageFallback(request, res);
        }
        finally {
            await this.cacheImageResourceOperation.execute();
        }
    }
    async fetchAndStreamResource(request, res) {
        try {
            await this.cacheImageResourceOperation.execute();
            const headers = await this.cacheImageResourceOperation.getHeaders;
            if (!headers) {
                this.logger.warn('Failed to fetch resource or generate headers.');
                await this.defaultImageFallback(request, res);
                return;
            }
            const fd = await (0, promises_1.open)(this.cacheImageResourceOperation.getResourcePath, 'r');
            res = MediaStreamImageRESTController_1.addHeadersToRequest(res, headers);
            const fileStream = fd.createReadStream();
            if (typeof res.on === 'function') {
                fileStream.pipe(res);
            }
            else {
                throw new TypeError('Response object is not a writable stream');
            }
        }
        catch (error) {
            this.logger.error(`Error during resource fetch and stream: ${error}`);
            await this.defaultImageFallback(request, res);
        }
    }
    async defaultImageFallback(request, res) {
        try {
            const optimizedDefaultImagePath = await this.cacheImageResourceOperation.optimizeAndServeDefaultImage(request.resizeOptions);
            res.sendFile(optimizedDefaultImagePath);
        }
        catch (defaultImageError) {
            this.logger.error(`Failed to serve default image: ${defaultImageError}`);
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
            quality,
        });
        const djangoApiUrl = process.env.NEST_PUBLIC_DJANGO_URL || 'http://localhost:8000';
        const request = new CacheImageRequest_1.default({
            resourceTarget: MediaStreamImageRESTController_1.resourceTargetPrepare(`${djangoApiUrl}/media/uploads/${imageType}/${image}`),
            resizeOptions,
        });
        this.logger.debug(`Request: ${JSON.stringify(request)}`);
        await this.handleStreamOrFallback(request, res);
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
                quality,
            }),
        });
        await this.handleStreamOrFallback(request, res);
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
        path: RoutePrefixes_1.IMAGE,
        version: RoutePrefixes_1.VERSION,
        scope: common_1.Scope.REQUEST,
    }),
    __metadata("design:paramtypes", [axios_1.HttpService,
        GenerateResourceIdentityFromRequestJob_1.default,
        CacheImageResourceOperation_1.default])
], MediaStreamImageRESTController);
exports.default = MediaStreamImageRESTController;
//# sourceMappingURL=MediaStreamImageRESTController.js.map