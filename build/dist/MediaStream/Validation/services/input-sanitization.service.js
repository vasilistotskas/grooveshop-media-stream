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
var InputSanitizationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputSanitizationService = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../../MediaStream/Config/config.service");
let InputSanitizationService = InputSanitizationService_1 = class InputSanitizationService {
    constructor(_configService) {
        this._configService = _configService;
        this._logger = new common_1.Logger(InputSanitizationService_1.name);
        this.allowedDomains = null;
    }
    getAllowedDomains() {
        if (this.allowedDomains === null) {
            this.allowedDomains = this._configService.getOptional('validation.allowedDomains', [
                'localhost',
                '127.0.0.1',
                'example.com',
                'test.com',
                'grooveshop.com',
                'cdn.grooveshop.com',
                'images.grooveshop.com',
            ]);
        }
        return this.allowedDomains;
    }
    async sanitize(input) {
        if (input === null || input === undefined) {
            return input;
        }
        if (typeof input === 'string') {
            return this.sanitizeString(input);
        }
        if (Array.isArray(input)) {
            const sanitizedArray = [];
            for (let i = 0; i < input.length; i++) {
                sanitizedArray[i] = await this.sanitize(input[i]);
            }
            return sanitizedArray;
        }
        if (typeof input === 'object') {
            return this.sanitizeObject(input);
        }
        return input;
    }
    sanitizeString(str) {
        if (str.toLowerCase().startsWith('javascript:')) {
            return '';
        }
        let sanitized = str
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
            .replace(/on\w+\s*=\s*[^"'\s>]+/gi, '')
            .replace(/data:text\/html[^;]*;/gi, '')
            .replace(/vbscript\s*:/gi, '')
            .replace(/expression\s*\(/gi, '')
            .trim();
        const maxLength = 2048;
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength);
            this._logger.warn(`String truncated to ${maxLength} characters for security`);
        }
        return sanitized;
    }
    async sanitizeObject(obj) {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            const sanitizedKey = this.sanitizeString(String(key));
            sanitized[sanitizedKey] = await this.sanitize(value);
        }
        return sanitized;
    }
    validateUrl(url) {
        try {
            const urlObj = new URL(url);
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                return false;
            }
            const allowedDomains = this.getAllowedDomains();
            const isAllowed = allowedDomains.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`));
            if (!isAllowed) {
                this._logger.warn(`URL blocked - not in whitelist: ${urlObj.hostname}`);
                return false;
            }
            return true;
        }
        catch (error) {
            this._logger.warn(`Invalid URL format: ${url}, error: ${error}`);
            return false;
        }
    }
    validateFileSize(sizeBytes, format) {
        const maxSizes = this._configService.getOptional('validation.maxFileSizes', {
            default: 10 * 1024 * 1024,
            jpeg: 5 * 1024 * 1024,
            jpg: 5 * 1024 * 1024,
            png: 8 * 1024 * 1024,
            webp: 3 * 1024 * 1024,
            gif: 2 * 1024 * 1024,
            svg: 1024 * 1024,
        });
        const maxSize = format ? maxSizes[format.toLowerCase()] || maxSizes.default : maxSizes.default;
        return sizeBytes > 0 && sizeBytes <= maxSize;
    }
    validateImageDimensions(width, height) {
        const maxWidth = 8192;
        const maxHeight = 8192;
        const maxPixels = 7680 * 4320;
        if (width <= 0 || height <= 0)
            return false;
        if (width > maxWidth || height > maxHeight)
            return false;
        if ((width * height) > maxPixels)
            return false;
        return true;
    }
};
exports.InputSanitizationService = InputSanitizationService;
exports.InputSanitizationService = InputSanitizationService = InputSanitizationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], InputSanitizationService);
//# sourceMappingURL=input-sanitization.service.js.map