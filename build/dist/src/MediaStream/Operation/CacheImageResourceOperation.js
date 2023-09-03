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
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const ResourceMetaData_1 = require("../DTO/ResourceMetaData");
const FetchResourceResponseJob_1 = require("../Job/FetchResourceResponseJob");
const WebpImageManipulationJob_1 = require("../Job/WebpImageManipulationJob");
const ValidateCacheImageRequestRule_1 = require("../Rule/ValidateCacheImageRequestRule");
const StoreResourceResponseToFileJob_1 = require("../Job/StoreResourceResponseToFileJob");
const GenerateResourceIdentityFromRequestJob_1 = require("../Job/GenerateResourceIdentityFromRequestJob");
let CacheImageResourceOperation = class CacheImageResourceOperation {
    httpService;
    validateCacheImageRequest;
    fetchResourceResponseJob;
    webpImageManipulationJob;
    storeResourceResponseToFileJob;
    generateResourceIdentityFromRequestJob;
    constructor(httpService, validateCacheImageRequest, fetchResourceResponseJob, webpImageManipulationJob, storeResourceResponseToFileJob, generateResourceIdentityFromRequestJob) {
        this.httpService = httpService;
        this.validateCacheImageRequest = validateCacheImageRequest;
        this.fetchResourceResponseJob = fetchResourceResponseJob;
        this.webpImageManipulationJob = webpImageManipulationJob;
        this.storeResourceResponseToFileJob = storeResourceResponseToFileJob;
        this.generateResourceIdentityFromRequestJob = generateResourceIdentityFromRequestJob;
    }
    request;
    id;
    metaData;
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
        if (!(0, fs_1.existsSync)(this.getResourcePath))
            return false;
        if (!(0, fs_1.existsSync)(this.getResourceMetaPath))
            return false;
        const headers = this.getHeaders;
        if (!headers.version || 1 !== headers.version)
            return false;
        return headers.dateCreated + headers.privateTTL > Date.now();
    }
    get getHeaders() {
        if (null === this.metaData) {
            this.metaData = JSON.parse((0, fs_1.readFileSync)(this.getResourceMetaPath));
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
            publicTTL: 24 * 60 * 60 * 1000
        };
        if (this.request.ttl) {
            resourceMetaDataOptions['privateTTL'] = this.request.ttl;
        }
        this.metaData = new ResourceMetaData_1.default(resourceMetaDataOptions);
        (0, fs_1.writeFileSync)(this.getResourceMetaPath, JSON.stringify(this.metaData));
        (0, fs_1.unlink)(this.getResourceTempPath, (err) => {
            if (null !== err)
                console.error(err);
        });
    }
};
CacheImageResourceOperation = __decorate([
    (0, common_1.Injectable)({ scope: common_1.Scope.REQUEST }),
    __metadata("design:paramtypes", [axios_1.HttpService,
        ValidateCacheImageRequestRule_1.default,
        FetchResourceResponseJob_1.default,
        WebpImageManipulationJob_1.default,
        StoreResourceResponseToFileJob_1.default,
        GenerateResourceIdentityFromRequestJob_1.default])
], CacheImageResourceOperation);
exports.default = CacheImageResourceOperation;
//# sourceMappingURL=CacheImageResourceOperation.js.map