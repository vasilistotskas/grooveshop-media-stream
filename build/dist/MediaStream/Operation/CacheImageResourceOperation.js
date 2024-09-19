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
var CacheImageResourceOperation_1;
Object.defineProperty(exports, "__esModule", { value: true });
const node_buffer_1 = require("node:buffer");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_process_1 = require("node:process");
const CacheImageRequest_1 = require("../API/DTO/CacheImageRequest");
const ResourceMetaData_1 = __importDefault(require("../DTO/ResourceMetaData"));
const FetchResourceResponseJob_1 = __importDefault(require("../Job/FetchResourceResponseJob"));
const GenerateResourceIdentityFromRequestJob_1 = __importDefault(require("../Job/GenerateResourceIdentityFromRequestJob"));
const StoreResourceResponseToFileJob_1 = __importDefault(require("../Job/StoreResourceResponseToFileJob"));
const WebpImageManipulationJob_1 = __importDefault(require("../Job/WebpImageManipulationJob"));
const ValidateCacheImageRequestRule_1 = __importDefault(require("../Rule/ValidateCacheImageRequestRule"));
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
let CacheImageResourceOperation = CacheImageResourceOperation_1 = class CacheImageResourceOperation {
    constructor(httpService, validateCacheImageRequest, fetchResourceResponseJob, webpImageManipulationJob, storeResourceResponseToFileJob, generateResourceIdentityFromRequestJob) {
        this.httpService = httpService;
        this.validateCacheImageRequest = validateCacheImageRequest;
        this.fetchResourceResponseJob = fetchResourceResponseJob;
        this.webpImageManipulationJob = webpImageManipulationJob;
        this.storeResourceResponseToFileJob = storeResourceResponseToFileJob;
        this.generateResourceIdentityFromRequestJob = generateResourceIdentityFromRequestJob;
        this.logger = new common_1.Logger(CacheImageResourceOperation_1.name);
    }
    get getResourcePath() {
        return `${(0, node_process_1.cwd)()}/storage/${this.id}.rsc`;
    }
    get getResourceTempPath() {
        return `${(0, node_process_1.cwd)()}/storage/${this.id}.rst`;
    }
    get getResourceMetaPath() {
        return `${(0, node_process_1.cwd)()}/storage/${this.id}.rsm`;
    }
    get resourceExists() {
        return (async () => {
            const resourcePathExists = await (0, promises_1.access)(this.getResourcePath).then(() => true).catch(() => false);
            if (!resourcePathExists) {
                this.logger.warn(`Resource path does not exist: ${this.getResourcePath}`);
                return false;
            }
            const resourceMetaPathExists = await (0, promises_1.access)(this.getResourceMetaPath).then(() => true).catch(() => false);
            if (!resourceMetaPathExists) {
                this.logger.warn(`Metadata path does not exist: ${this.getResourceMetaPath}`);
                return false;
            }
            const headers = await this.getHeaders;
            if (!headers) {
                this.logger.warn('Metadata headers are missing or invalid');
                return false;
            }
            if (!headers.version || headers.version !== 1) {
                this.logger.warn('Invalid or missing version in metadata');
                return false;
            }
            return headers.dateCreated + headers.privateTTL > Date.now();
        })();
    }
    get getHeaders() {
        return (async () => {
            if (!this.metaData) {
                try {
                    const exists = await (0, promises_1.access)(this.getResourceMetaPath).then(() => true).catch(() => false);
                    if (exists) {
                        this.metaData = JSON.parse(await (0, promises_1.readFile)(this.getResourceMetaPath));
                    }
                    else {
                        this.logger.warn(`Metadata file does not exist: ${this.getResourceMetaPath}`);
                        return null;
                    }
                }
                catch (error) {
                    this.logger.error('Failed to read or parse resource metadata', error);
                    return null;
                }
            }
            return this.metaData;
        })();
    }
    async setup(cacheImageRequest) {
        this.request = cacheImageRequest;
        await this.validateCacheImageRequest.setup(this.request);
        await this.validateCacheImageRequest.apply();
        this.id = await this.generateResourceIdentityFromRequestJob.handle(this.request);
        this.metaData = null;
    }
    async execute() {
        if (await this.resourceExists) {
            this.logger.log('Resource already exists.');
            return;
        }
        try {
            const response = await this.fetchResourceResponseJob.handle(this.request);
            if (!response) {
                this.logger.error('Failed to fetch the resource. The response is empty or invalid.');
                return;
            }
            await this.storeResourceResponseToFileJob.handle(this.request.resourceTarget, this.getResourceTempPath, response);
            if (this.request.resizeOptions.format === CacheImageRequest_1.SupportedResizeFormats.svg) {
                this.logger.log('Skipping manipulation for SVG format.');
                let fileContent;
                try {
                    fileContent = await (0, promises_1.readFile)(this.getResourceTempPath, 'utf8');
                }
                catch (error) {
                    this.logger.error('Failed to read file content', error);
                    throw new common_1.InternalServerErrorException('Error fetching or processing image.');
                }
                if (fileContent.trim().startsWith('<svg')) {
                    await (0, promises_1.writeFile)(this.getResourcePath, fileContent);
                    this.logger.log(`Successfully validated and wrote SVG to resource path: ${this.getResourcePath}`);
                    const resourceMetaDataOptions = {
                        size: String(node_buffer_1.Buffer.byteLength(fileContent, 'utf8')),
                        format: CacheImageRequest_1.SupportedResizeFormats.svg,
                        dateCreated: Date.now(),
                        publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                    };
                    this.metaData = new ResourceMetaData_1.default(resourceMetaDataOptions);
                    await (0, promises_1.writeFile)(this.getResourceMetaPath, JSON.stringify(this.metaData));
                }
                else {
                    this.logger.warn('The file is not a valid SVG. Serving default WebP image.');
                    const manipulationResult = await this.webpImageManipulationJob.handle(this.getResourceTempPath, this.getResourcePath, this.request.resizeOptions);
                    const resourceMetaDataOptions = {
                        size: manipulationResult.size,
                        format: manipulationResult.format,
                        p: this.request.ttl,
                        dateCreated: Date.now(),
                        publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                    };
                    if (this.request.ttl) {
                        resourceMetaDataOptions.privateTTL = this.request.ttl;
                    }
                    this.metaData = new ResourceMetaData_1.default(resourceMetaDataOptions);
                }
            }
            else {
                this.logger.log('Processing image manipulation...');
                const manipulationResult = await this.webpImageManipulationJob.handle(this.getResourceTempPath, this.getResourcePath, this.request.resizeOptions);
                const resourceMetaDataOptions = {
                    size: manipulationResult.size,
                    format: manipulationResult.format,
                    p: this.request.ttl,
                    dateCreated: Date.now(),
                    publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                };
                if (this.request.ttl) {
                    resourceMetaDataOptions.privateTTL = this.request.ttl;
                }
                this.metaData = new ResourceMetaData_1.default(resourceMetaDataOptions);
            }
            await (0, promises_1.writeFile)(this.getResourceMetaPath, JSON.stringify(this.metaData));
            try {
                await (0, promises_1.unlink)(this.getResourceTempPath);
            }
            catch (error) {
                this.logger.error(error);
            }
        }
        catch (error) {
            this.logger.error('Failed to execute CacheImageResourceOperation', error);
            throw new common_1.InternalServerErrorException('Error fetching or processing image.');
        }
    }
    async optimizeAndServeDefaultImage(resizeOptions) {
        const optionsString = this.createOptionsString(resizeOptions);
        const optimizedImageName = `default_optimized_${optionsString}.webp`;
        const optimizedImagePath = `${(0, node_process_1.cwd)()}/storage/${optimizedImageName}`;
        const resizeOptionsWithDefaults = {
            ...resizeOptions,
            fit: CacheImageRequest_1.FitOptions.contain,
            position: CacheImageRequest_1.PositionOptions.entropy,
            format: CacheImageRequest_1.SupportedResizeFormats.webp,
            background: CacheImageRequest_1.BackgroundOptions.transparent,
            trimThreshold: 5,
            quality: 100,
        };
        const exists = await (0, promises_1.access)(optimizedImagePath).then(() => true).catch(() => false);
        if (!exists) {
            const defaultImagePath = `${(0, node_process_1.cwd)()}/public/default.png`;
            await this.webpImageManipulationJob.handle(defaultImagePath, optimizedImagePath, resizeOptionsWithDefaults);
        }
        return optimizedImagePath;
    }
    createOptionsString(resizeOptions) {
        const sortedOptions = Object.keys(resizeOptions).sort().reduce((obj, key) => {
            obj[key] = resizeOptions[key];
            return obj;
        }, {});
        const optionsString = JSON.stringify(sortedOptions);
        return (0, node_crypto_1.createHash)('md5').update(optionsString).digest('hex');
    }
};
CacheImageResourceOperation = CacheImageResourceOperation_1 = __decorate([
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