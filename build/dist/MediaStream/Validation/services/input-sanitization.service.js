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
        const lowerStr = str.toLowerCase();
        const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:', 'about:'];
        for (const protocol of dangerousProtocols) {
            if (lowerStr.startsWith(protocol)) {
                return '';
            }
        }
        const emptyStringPatterns = [
            /^\s*on\w+\s*=.*$/i,
            /^\s*javascript\s*:.*$/i,
            /^\s*vbscript\s*:.*$/i,
            /^\s*data\s*:.*$/i,
        ];
        for (const pattern of emptyStringPatterns) {
            if (pattern.test(str)) {
                this._logger.warn(`Standalone dangerous pattern detected, returning empty string`);
                return '';
            }
        }
        let sanitized = str;
        let previousLength = 0;
        let iterations = 0;
        const maxIterations = 10;
        while (sanitized.length !== previousLength && iterations < maxIterations) {
            previousLength = sanitized.length;
            iterations++;
            sanitized = this.performSanitizationPass(sanitized);
        }
        sanitized = sanitized.trim();
        const maxLength = 2048;
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength);
            this._logger.warn(`String truncated to ${maxLength} characters for security`);
        }
        return sanitized;
    }
    performSanitizationPass(input) {
        let result = input;
        result = result.replace(/<[^>]*>/g, '');
        result = this.removeEventHandlers(result);
        result = this.removeStyleAttributes(result);
        result = result.replace(/(?:javascript|vbscript|data|file|ftp|about)\s*:\S*/gi, '');
        result = result.replace(/data\s*:[^,\s]*/gi, '');
        result = result.replace(/(?:expression|eval)\s*\(/gi, '');
        result = result.replace(/&[#\w]+;/g, '');
        result = result.replace(/&#x?[0-9a-f]+;?/gi, '');
        return result;
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
            const lowerUrl = url.toLowerCase().trim();
            const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:', 'about:'];
            for (const protocol of dangerousProtocols) {
                if (lowerUrl.startsWith(protocol)) {
                    this._logger.warn(`Dangerous protocol detected: ${protocol}`);
                    return false;
                }
            }
            const urlObj = new URL(url);
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                this._logger.warn(`Invalid protocol: ${urlObj.protocol}`);
                return false;
            }
            if (!urlObj.hostname || urlObj.hostname.length === 0) {
                this._logger.warn('Empty hostname detected');
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
    removeEventHandlers(input) {
        let result = input;
        let previousResult = '';
        while (result !== previousResult) {
            previousResult = result;
            result = result.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '');
            result = result.replace(/\bon\w+\s*=\s*[^"'\s]+/gi, '');
            result = result.replace(/\bon\w+\s*=/gi, '');
        }
        return result;
    }
    removeStyleAttributes(input) {
        let result = input;
        let previousResult = '';
        while (result !== previousResult) {
            previousResult = result;
            result = result.replace(/\bstyle\s*=\s*["'][^"']*["']/gi, '');
            result = result.replace(/\bstyle\s*=\s*[^"'\s]+/gi, '');
            result = result.replace(/\bstyle\s*=/gi, '');
        }
        return result;
    }
};
exports.InputSanitizationService = InputSanitizationService;
exports.InputSanitizationService = InputSanitizationService = InputSanitizationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], InputSanitizationService);
//# sourceMappingURL=input-sanitization.service.js.map