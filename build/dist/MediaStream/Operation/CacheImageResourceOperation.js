"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return CacheImageResourceOperation;
    }
});
const _axios = require("@nestjs/axios");
const _common = require("@nestjs/common");
const _fs = require("fs");
const _ResourceMetaData = /*#__PURE__*/ _interop_require_default(require("../DTO/ResourceMetaData"));
const _FetchResourceResponseJob = /*#__PURE__*/ _interop_require_default(require("../Job/FetchResourceResponseJob"));
const _WebpImageManipulationJob = /*#__PURE__*/ _interop_require_default(require("../Job/WebpImageManipulationJob"));
const _ValidateCacheImageRequestRule = /*#__PURE__*/ _interop_require_default(require("../Rule/ValidateCacheImageRequestRule"));
const _StoreResourceResponseToFileJob = /*#__PURE__*/ _interop_require_default(require("../Job/StoreResourceResponseToFileJob"));
const _GenerateResourceIdentityFromRequestJob = /*#__PURE__*/ _interop_require_default(require("../Job/GenerateResourceIdentityFromRequestJob"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
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
let CacheImageResourceOperation = class CacheImageResourceOperation {
    get getResourcePath() {
        return `${process.cwd()}/storage/${this.id}.rsc`;
    }
    get getResourceTempPath() {
        return `${process.cwd()}/storage/${this.id}.rst`;
    }
    get getResourceMetaPath() {
        return `${process.cwd()}/storage/${this.id}.rsm`;
    }
    get resourceExists() {
        if (!(0, _fs.existsSync)(this.getResourcePath)) return false;
        if (!(0, _fs.existsSync)(this.getResourceMetaPath)) return false;
        const headers = this.getHeaders;
        if (!headers.version || 1 !== headers.version) return false;
        return headers.dateCreated + headers.privateTTL > Date.now();
    }
    get getHeaders() {
        if (null === this.metaData) {
            this.metaData = JSON.parse((0, _fs.readFileSync)(this.getResourceMetaPath));
        }
        return this.metaData;
    }
    async setup(cacheImageRequest) {
        this.request = cacheImageRequest;
        await this.validateCacheImageRequest.setup(this.request);
        await this.validateCacheImageRequest.apply();
        this.id = await this.generateResourceIdentityFromRequestJob.handle(this.request);
        this.metaData = null;
    }
    async execute() {
        if (this.resourceExists) {
            return;
        }
        const response = await this.fetchResourceResponseJob.handle(this.request);
        await this.storeResourceResponseToFileJob.handle(this.request.resourceTarget, this.getResourceTempPath, response);
        const manipulationResult = await this.webpImageManipulationJob.handle(this.getResourceTempPath, this.getResourcePath, this.request.resizeOptions);
        const resourceMetaDataOptions = {
            size: manipulationResult.size,
            format: manipulationResult.format,
            p: this.request.ttl,
            dateCreated: Date.now(),
            publicTTL: 12 * 30 * 24 * 60 * 60 * 1000
        };
        if (this.request.ttl) {
            resourceMetaDataOptions['privateTTL'] = this.request.ttl;
        }
        this.metaData = new _ResourceMetaData.default(resourceMetaDataOptions);
        (0, _fs.writeFileSync)(this.getResourceMetaPath, JSON.stringify(this.metaData));
        (0, _fs.unlink)(this.getResourceTempPath, (err)=>{
            if (null !== err) {
                this.logger.error(err);
            }
        });
    }
    constructor(httpService, validateCacheImageRequest, fetchResourceResponseJob, webpImageManipulationJob, storeResourceResponseToFileJob, generateResourceIdentityFromRequestJob){
        this.httpService = httpService;
        this.validateCacheImageRequest = validateCacheImageRequest;
        this.fetchResourceResponseJob = fetchResourceResponseJob;
        this.webpImageManipulationJob = webpImageManipulationJob;
        this.storeResourceResponseToFileJob = storeResourceResponseToFileJob;
        this.generateResourceIdentityFromRequestJob = generateResourceIdentityFromRequestJob;
        this.logger = new _common.Logger(CacheImageResourceOperation.name);
    }
};
CacheImageResourceOperation = _ts_decorate([
    (0, _common.Injectable)({
        scope: _common.Scope.REQUEST
    }),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _axios.HttpService === "undefined" ? Object : _axios.HttpService,
        typeof _ValidateCacheImageRequestRule.default === "undefined" ? Object : _ValidateCacheImageRequestRule.default,
        typeof _FetchResourceResponseJob.default === "undefined" ? Object : _FetchResourceResponseJob.default,
        typeof _WebpImageManipulationJob.default === "undefined" ? Object : _WebpImageManipulationJob.default,
        typeof _StoreResourceResponseToFileJob.default === "undefined" ? Object : _StoreResourceResponseToFileJob.default,
        typeof _GenerateResourceIdentityFromRequestJob.default === "undefined" ? Object : _GenerateResourceIdentityFromRequestJob.default
    ])
], CacheImageResourceOperation);
