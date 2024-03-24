"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return MediaStreamImageRESTController;
    }
});
const _express = require("express");
const _fs = require("fs");
const _axios = require("@nestjs/axios");
const _common = require("@nestjs/common");
const _RoutePrefixes = require("../../Constant/RoutePrefixes");
const _CacheImageResourceOperation = /*#__PURE__*/ _interop_require_default(require("../../Operation/CacheImageResourceOperation"));
const _CacheImageRequest = /*#__PURE__*/ _interop_require_wildcard(require("../DTO/CacheImageRequest"));
const _GenerateResourceIdentityFromRequestJob = /*#__PURE__*/ _interop_require_default(require("../../Job/GenerateResourceIdentityFromRequestJob"));
const _process = /*#__PURE__*/ _interop_require_wildcard(require("process"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function _getRequireWildcardCache(nodeInterop) {
    if (typeof WeakMap !== "function") return null;
    var cacheBabelInterop = new WeakMap();
    var cacheNodeInterop = new WeakMap();
    return (_getRequireWildcardCache = function(nodeInterop) {
        return nodeInterop ? cacheNodeInterop : cacheBabelInterop;
    })(nodeInterop);
}
function _interop_require_wildcard(obj, nodeInterop) {
    if (!nodeInterop && obj && obj.__esModule) {
        return obj;
    }
    if (obj === null || typeof obj !== "object" && typeof obj !== "function") {
        return {
            default: obj
        };
    }
    var cache = _getRequireWildcardCache(nodeInterop);
    if (cache && cache.has(obj)) {
        return cache.get(obj);
    }
    var newObj = {
        __proto__: null
    };
    var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for(var key in obj){
        if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) {
            var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
            if (desc && (desc.get || desc.set)) {
                Object.defineProperty(newObj, key, desc);
            } else {
                newObj[key] = obj[key];
            }
        }
    }
    newObj.default = obj;
    if (cache) {
        cache.set(obj, newObj);
    }
    return newObj;
}
function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
function _ts_param(paramIndex, decorator) {
    return function(target, key) {
        decorator(target, key, paramIndex);
    };
}
let MediaStreamImageRESTController = class MediaStreamImageRESTController {
    /**
	 * Adds required headers to the response
	 *
	 * @param res
	 * @param headers
	 * @protected
	 */ static addHeadersToRequest(res, headers) {
        const expiresAt = Date.now() + headers.publicTTL;
        return res.header('Content-Type', `image/${headers.format}`).header('Content-Length', headers.size.toString()).header('Cache-Control', `max-age=${headers.publicTTL / 1000}, public`).header('Expires', new Date(expiresAt).toUTCString());
    }
    /**
	 * Streams the resource from the cacheImageResourceOperation
	 *
	 * @param request
	 * @param res
	 * @protected
	 */ async streamRequestedResource(request, res) {
        try {
            await this.cacheImageResourceOperation.setup(request);
            const headers = this.cacheImageResourceOperation.getHeaders;
            res = MediaStreamImageRESTController.addHeadersToRequest(res, headers);
            if (this.cacheImageResourceOperation.resourceExists) {
                (0, _fs.createReadStream)(this.cacheImageResourceOperation.getResourcePath).pipe(res);
            } else {
                await this.cacheImageResourceOperation.execute();
                (0, _fs.createReadStream)(this.cacheImageResourceOperation.getResourcePath).pipe(res);
            }
        } catch (error) {
            this.logger.warn('Failed to stream requested resource', error);
            try {
                const optimizedDefaultImagePath = await this.cacheImageResourceOperation.optimizeAndServeDefaultImage(request.resizeOptions);
                res.sendFile(optimizedDefaultImagePath);
            } catch (defaultImageError) {
                this.logger.error('Failed to serve default image', defaultImageError);
                throw new _common.InternalServerErrorException('Failed to process the image request.');
            }
        }
    }
    static resourceTargetPrepare(resourceTarget) {
        return resourceTarget;
    }
    async uploadedImage(imageType, image, width = null, height = null, fit = _CacheImageRequest.FitOptions.contain, position = _CacheImageRequest.PositionOptions.entropy, background = _CacheImageRequest.BackgroundOptions.transparent, trimThreshold = 5, format = _CacheImageRequest.SupportedResizeFormats.webp, quality = 100, res) {
        const resizeOptions = new _CacheImageRequest.ResizeOptions({
            width,
            height,
            position,
            background,
            fit,
            trimThreshold,
            format,
            quality
        });
        const djangoApiUrl = _process.env.NEST_PUBLIC_DJANGO_URL || 'http://localhost:8000';
        const request = new _CacheImageRequest.default({
            resourceTarget: MediaStreamImageRESTController.resourceTargetPrepare(`${djangoApiUrl}/media/uploads/${imageType}/${image}`),
            resizeOptions: resizeOptions
        });
        await this.streamRequestedResource(request, res);
    }
    async staticImage(image, width = null, height = null, fit = _CacheImageRequest.FitOptions.contain, position = _CacheImageRequest.PositionOptions.entropy, background = _CacheImageRequest.BackgroundOptions.transparent, trimThreshold = 5, format = _CacheImageRequest.SupportedResizeFormats.webp, quality = 100, res) {
        const djangoApiUrl = _process.env.NEST_PUBLIC_DJANGO_URL || 'http://localhost:8000';
        const request = new _CacheImageRequest.default({
            resourceTarget: MediaStreamImageRESTController.resourceTargetPrepare(`${djangoApiUrl}/static/images/${image}`),
            resizeOptions: new _CacheImageRequest.ResizeOptions({
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
    async publicNuxtImage(image, width = null, height = null, fit = _CacheImageRequest.FitOptions.contain, position = _CacheImageRequest.PositionOptions.entropy, background = _CacheImageRequest.BackgroundOptions.transparent, trimThreshold = 5, format = _CacheImageRequest.SupportedResizeFormats.webp, quality = 100, res) {
        const nuxtPublicUrl = _process.env.NEST_PUBLIC_NUXT_URL || 'http://localhost:3000';
        const request = new _CacheImageRequest.default({
            resourceTarget: MediaStreamImageRESTController.resourceTargetPrepare(`${nuxtPublicUrl}/img/${image}`),
            resizeOptions: new _CacheImageRequest.ResizeOptions({
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
    constructor(httpService, generateResourceIdentityFromRequestJob, cacheImageResourceOperation){
        this.httpService = httpService;
        this.generateResourceIdentityFromRequestJob = generateResourceIdentityFromRequestJob;
        this.cacheImageResourceOperation = cacheImageResourceOperation;
        this.logger = new _common.Logger(MediaStreamImageRESTController.name);
    }
};
_ts_decorate([
    (0, _common.Get)('media/uploads/:imageType/:image/:width?/:height?/:fit?/:position?/:background?/:trimThreshold?/:format?/:quality?'),
    _ts_param(0, (0, _common.Param)('imageType')),
    _ts_param(1, (0, _common.Param)('image')),
    _ts_param(2, (0, _common.Param)('width')),
    _ts_param(3, (0, _common.Param)('height')),
    _ts_param(4, (0, _common.Param)('fit')),
    _ts_param(5, (0, _common.Param)('position')),
    _ts_param(6, (0, _common.Param)('background')),
    _ts_param(7, (0, _common.Param)('trimThreshold')),
    _ts_param(8, (0, _common.Param)('format')),
    _ts_param(9, (0, _common.Param)('quality')),
    _ts_param(10, (0, _common.Res)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String,
        String,
        Number,
        Number,
        typeof _CacheImageRequest.FitOptions === "undefined" ? Object : _CacheImageRequest.FitOptions,
        void 0,
        void 0,
        void 0,
        typeof _CacheImageRequest.SupportedResizeFormats === "undefined" ? Object : _CacheImageRequest.SupportedResizeFormats,
        void 0,
        typeof _express.Response === "undefined" ? Object : _express.Response
    ]),
    _ts_metadata("design:returntype", Promise)
], MediaStreamImageRESTController.prototype, "uploadedImage", null);
_ts_decorate([
    (0, _common.Get)('static/images/:image/:width?/:height?/:fit?/:position?/:background?/:trimThreshold?/:format?/:quality?'),
    _ts_param(0, (0, _common.Param)('image')),
    _ts_param(1, (0, _common.Param)('width')),
    _ts_param(2, (0, _common.Param)('height')),
    _ts_param(3, (0, _common.Param)('fit')),
    _ts_param(4, (0, _common.Param)('position')),
    _ts_param(5, (0, _common.Param)('background')),
    _ts_param(6, (0, _common.Param)('trimThreshold')),
    _ts_param(7, (0, _common.Param)('format')),
    _ts_param(8, (0, _common.Param)('quality')),
    _ts_param(9, (0, _common.Res)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String,
        Number,
        Number,
        typeof _CacheImageRequest.FitOptions === "undefined" ? Object : _CacheImageRequest.FitOptions,
        void 0,
        void 0,
        void 0,
        typeof _CacheImageRequest.SupportedResizeFormats === "undefined" ? Object : _CacheImageRequest.SupportedResizeFormats,
        void 0,
        typeof _express.Response === "undefined" ? Object : _express.Response
    ]),
    _ts_metadata("design:returntype", Promise)
], MediaStreamImageRESTController.prototype, "staticImage", null);
_ts_decorate([
    (0, _common.Get)('img/:image/:width?/:height?/:fit?/:position?/:background?/:trimThreshold?/:format?/:quality?'),
    _ts_param(0, (0, _common.Param)('image')),
    _ts_param(1, (0, _common.Param)('width')),
    _ts_param(2, (0, _common.Param)('height')),
    _ts_param(3, (0, _common.Param)('fit')),
    _ts_param(4, (0, _common.Param)('position')),
    _ts_param(5, (0, _common.Param)('background')),
    _ts_param(6, (0, _common.Param)('trimThreshold')),
    _ts_param(7, (0, _common.Param)('format')),
    _ts_param(8, (0, _common.Param)('quality')),
    _ts_param(9, (0, _common.Res)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String,
        Number,
        Number,
        typeof _CacheImageRequest.FitOptions === "undefined" ? Object : _CacheImageRequest.FitOptions,
        void 0,
        void 0,
        void 0,
        typeof _CacheImageRequest.SupportedResizeFormats === "undefined" ? Object : _CacheImageRequest.SupportedResizeFormats,
        void 0,
        typeof _express.Response === "undefined" ? Object : _express.Response
    ]),
    _ts_metadata("design:returntype", Promise)
], MediaStreamImageRESTController.prototype, "publicNuxtImage", null);
MediaStreamImageRESTController = _ts_decorate([
    (0, _common.Controller)({
        path: _RoutePrefixes.IMAGE,
        version: _RoutePrefixes.VERSION,
        scope: _common.Scope.REQUEST
    }),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _axios.HttpService === "undefined" ? Object : _axios.HttpService,
        typeof _GenerateResourceIdentityFromRequestJob.default === "undefined" ? Object : _GenerateResourceIdentityFromRequestJob.default,
        typeof _CacheImageResourceOperation.default === "undefined" ? Object : _CacheImageResourceOperation.default
    ])
], MediaStreamImageRESTController);

//# sourceMappingURL=MediaStreamImageRESTController.js.map