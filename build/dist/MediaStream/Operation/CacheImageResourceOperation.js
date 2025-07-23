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
const CacheImageRequest_1 = require("../API/DTO/CacheImageRequest");
const logger_util_1 = require("../Correlation/utils/logger.util");
const ResourceMetaData_1 = __importDefault(require("../DTO/ResourceMetaData"));
const FetchResourceResponseJob_1 = __importDefault(require("../Job/FetchResourceResponseJob"));
const GenerateResourceIdentityFromRequestJob_1 = __importDefault(require("../Job/GenerateResourceIdentityFromRequestJob"));
const StoreResourceResponseToFileJob_1 = __importDefault(require("../Job/StoreResourceResponseToFileJob"));
const WebpImageManipulationJob_1 = __importDefault(require("../Job/WebpImageManipulationJob"));
const ValidateCacheImageRequestRule_1 = __importDefault(require("../Rule/ValidateCacheImageRequestRule"));
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const UnableToFetchResourceException_1 = __importDefault(require("../API/Exception/UnableToFetchResourceException"));
let CacheImageResourceOperation = CacheImageResourceOperation_1 = class CacheImageResourceOperation {
    constructor(httpService, validateCacheImageRequest, fetchResourceResponseJob, webpImageManipulationJob, storeResourceResponseToFileJob, generateResourceIdentityFromRequestJob) {
        this.httpService = httpService;
        this.validateCacheImageRequest = validateCacheImageRequest;
        this.fetchResourceResponseJob = fetchResourceResponseJob;
        this.webpImageManipulationJob = webpImageManipulationJob;
        this.storeResourceResponseToFileJob = storeResourceResponseToFileJob;
        this.generateResourceIdentityFromRequestJob = generateResourceIdentityFromRequestJob;
        this.logger = new common_1.Logger(CacheImageResourceOperation_1.name);
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
            try {
                logger_util_1.CorrelatedLogger.debug(`Checking if resource exists: ${this.getResourcePath}`, CacheImageResourceOperation_1.name);
                const resourcePathExists = await (0, promises_1.access)(this.getResourcePath).then(() => true).catch(() => false);
                if (!resourcePathExists) {
                    logger_util_1.CorrelatedLogger.warn(`Resource path does not exist: ${this.getResourcePath}`, CacheImageResourceOperation_1.name);
                    return false;
                }
                const resourceMetaPathExists = await (0, promises_1.access)(this.getResourceMetaPath).then(() => true).catch(() => false);
                if (!resourceMetaPathExists) {
                    logger_util_1.CorrelatedLogger.warn(`Metadata path does not exist: ${this.getResourceMetaPath}`, CacheImageResourceOperation_1.name);
                    return false;
                }
                const headers = await this.getHeaders;
                if (!headers) {
                    logger_util_1.CorrelatedLogger.warn('Metadata headers are missing or invalid', CacheImageResourceOperation_1.name);
                    return false;
                }
                if (!headers.version || headers.version !== 1) {
                    logger_util_1.CorrelatedLogger.warn('Invalid or missing version in metadata', CacheImageResourceOperation_1.name);
                    return false;
                }
                return headers.dateCreated + headers.privateTTL > Date.now();
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Error checking resource existence: ${error.message}`, CacheImageResourceOperation_1.name);
                return false;
            }
        })();
    }
    get getHeaders() {
        return (async () => {
            if (!this.metaData) {
                try {
                    const exists = await (0, promises_1.access)(this.getResourceMetaPath).then(() => true).catch(() => false);
                    if (exists) {
                        const content = await (0, promises_1.readFile)(this.getResourceMetaPath, 'utf8');
                        this.metaData = new ResourceMetaData_1.default(JSON.parse(content));
                    }
                    else {
                        logger_util_1.CorrelatedLogger.warn('Metadata file does not exist.', CacheImageResourceOperation_1.name);
                        return null;
                    }
                }
                catch (error) {
                    logger_util_1.CorrelatedLogger.error(`Failed to read or parse resource metadata: ${error}`, '', CacheImageResourceOperation_1.name);
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
        try {
            if (await this.resourceExists) {
                logger_util_1.CorrelatedLogger.log('Resource already exists.', CacheImageResourceOperation_1.name);
                return;
            }
            const response = await this.fetchResourceResponseJob.handle(this.request);
            if (!response || response.status === 404) {
                throw new UnableToFetchResourceException_1.default(this.request.resourceTarget);
            }
            await this.storeResourceResponseToFileJob.handle(this.request.resourceTarget, this.getResourceTempPath, response);
            if (this.request.resourceTarget.toLowerCase().endsWith('.svg')) {
                logger_util_1.CorrelatedLogger.debug('Processing SVG format.', CacheImageResourceOperation_1.name);
                try {
                    const svgContent = await (0, promises_1.readFile)(this.getResourceTempPath, 'utf8');
                    if (!svgContent.toLowerCase().includes('<svg')) {
                        logger_util_1.CorrelatedLogger.warn('The file is not a valid SVG. Serving default WebP image.', CacheImageResourceOperation_1.name);
                        await this.optimizeAndServeDefaultImage(this.request.resizeOptions);
                        return;
                    }
                    await (0, promises_1.writeFile)(this.getResourcePath, svgContent, 'utf8');
                    await (0, promises_1.writeFile)(this.getResourceMetaPath, JSON.stringify(new ResourceMetaData_1.default({
                        version: 1,
                        size: node_buffer_1.Buffer.from(svgContent).length.toString(),
                        format: 'svg',
                        dateCreated: Date.now(),
                        publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                        privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
                    })), 'utf8');
                }
                catch (error) {
                    logger_util_1.CorrelatedLogger.error(`Failed to process SVG: ${error.message}`, error.stack, CacheImageResourceOperation_1.name);
                    throw error;
                }
            }
            else {
                const result = await this.webpImageManipulationJob.handle(this.getResourceTempPath, this.getResourcePath, this.request.resizeOptions);
                await (0, promises_1.writeFile)(this.getResourceMetaPath, JSON.stringify(new ResourceMetaData_1.default({
                    version: 1,
                    size: result.size,
                    format: result.format,
                    dateCreated: Date.now(),
                    publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
                    privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
                })), 'utf8');
            }
            try {
                await (0, promises_1.unlink)(this.getResourceTempPath);
            }
            catch (error) {
                logger_util_1.CorrelatedLogger.warn(`Failed to delete temporary file: ${error.message}`, CacheImageResourceOperation_1.name);
            }
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Failed to execute CacheImageResourceOperation: ${error.message}`, error.stack, CacheImageResourceOperation_1.name);
            throw new common_1.InternalServerErrorException('Error fetching or processing image.');
        }
    }
    async optimizeAndServeDefaultImage(resizeOptions) {
        const resizeOptionsWithDefaults = {
            width: resizeOptions.width || 800,
            height: resizeOptions.height || 600,
            fit: resizeOptions.fit || CacheImageRequest_1.FitOptions.contain,
            position: resizeOptions.position || CacheImageRequest_1.PositionOptions.entropy,
            format: resizeOptions.format || CacheImageRequest_1.SupportedResizeFormats.webp,
            background: resizeOptions.background || CacheImageRequest_1.BackgroundOptions.white,
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