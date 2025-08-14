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
var SecurityCheckerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityCheckerService = void 0;
const config_service_1 = require("../../Config/config.service");
const common_1 = require("@nestjs/common");
let SecurityCheckerService = SecurityCheckerService_1 = class SecurityCheckerService {
    constructor(_configService) {
        this._configService = _configService;
        this._logger = new common_1.Logger(SecurityCheckerService_1.name);
        this.securityEvents = [];
        this.suspiciousPatterns = [
            /<script\b[^>]{0,100}>/i,
            /javascript:/i,
            /vbscript:/i,
            /data:text\/html/i,
            /\bon\w{1,20}\s*=/i,
            /union\s{1,5}select/i,
            /drop\s{1,5}table/i,
            /insert\s{1,5}into/i,
            /delete\s{1,5}from/i,
            /\.\.\//,
            /\.\.\\/,
            /\.\.\\\\/,
            /%2e%2e%2f/i,
            /%2e%2e%5c/i,
            /;\s{0,5}rm\s{1,5}-rf/i,
            /;\s{0,5}cat\s{1,5}/i,
            /;\s{0,5}ls\s{1,5}/i,
            /\|\s{0,5}nc\s{1,5}/i,
            /<!entity\b/i,
            /<!doctype[^>]{0,100}\[/i,
            /\(\|\(/,
            /\)\(\|/,
            /\$where\b/i,
            /\$ne\b/i,
            /\$gt\b/i,
            /\$lt\b/i,
        ];
    }
    async checkForMaliciousContent(input) {
        if (input === null || input === undefined) {
            return false;
        }
        if (typeof input === 'string') {
            return this.checkString(input);
        }
        if (typeof input === 'object') {
            return this.checkObject(input);
        }
        if (Array.isArray(input)) {
            for (const item of input) {
                if (await this.checkForMaliciousContent(item)) {
                    return true;
                }
            }
        }
        return false;
    }
    checkString(str) {
        const maxLength = this._configService.getOptional('validation.maxStringLength', 10000);
        if (str.length === 0) {
            return false;
        }
        if (str.length > maxLength) {
            this._logger.warn(`Excessively long string detected: ${str.length} characters`);
            return true;
        }
        const maxPatternTestLength = 5000;
        const testStr = str.length > maxPatternTestLength ? str.substring(0, maxPatternTestLength) : str;
        for (const pattern of this.suspiciousPatterns) {
            try {
                if (pattern.test(testStr)) {
                    this._logger.warn(`Suspicious pattern detected: ${pattern.source}`);
                    return true;
                }
            }
            catch {
                this._logger.warn(`Pattern matching failed, potential ReDoS attempt: ${pattern.source}`);
                return true;
            }
        }
        if (this.hasHighEntropy(str)) {
            this._logger.warn('High entropy string detected (potential encoded payload)');
            return true;
        }
        return false;
    }
    async checkObject(obj) {
        const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
        for (const key of Object.keys(obj)) {
            if (dangerousKeys.includes(key)) {
                this._logger.warn(`Dangerous object key detected: ${key}`);
                return true;
            }
            if (await this.checkForMaliciousContent(obj[key])) {
                return true;
            }
        }
        if (this.getObjectDepth(obj) > 10) {
            this._logger.warn('Excessively deep object detected (potential DoS)');
            return true;
        }
        return false;
    }
    hasHighEntropy(str) {
        const maxLengthForEntropy = 1000;
        if (str.length < 20 || str.length > maxLengthForEntropy)
            return false;
        const sampleStr = str.length > 500 ? str.substring(0, 500) : str;
        const charCount = {};
        for (const char of sampleStr) {
            charCount[char] = (charCount[char] || 0) + 1;
        }
        if (Object.keys(charCount).length > 256) {
            return false;
        }
        let entropy = 0;
        const length = sampleStr.length;
        for (const count of Object.values(charCount)) {
            const probability = count / length;
            entropy -= probability * Math.log2(probability);
        }
        return entropy > 4.5;
    }
    getObjectDepth(obj, depth = 0) {
        if (depth > 20)
            return depth;
        if (obj === null || typeof obj !== 'object') {
            return depth;
        }
        let maxDepth = depth;
        for (const value of Object.values(obj)) {
            if (typeof value === 'object' && value !== null) {
                const childDepth = this.getObjectDepth(value, depth + 1);
                maxDepth = Math.max(maxDepth, childDepth);
            }
        }
        return maxDepth;
    }
    async logSecurityEvent(event) {
        if (!event.timestamp) {
            event.timestamp = new Date();
        }
        this.securityEvents.push(event);
        this._logger.warn(`Security event: ${event.type}`, {
            source: event.source,
            details: event.details,
            clientIp: event.clientIp,
            userAgent: event.userAgent,
            timestamp: event.timestamp,
        });
        if (this.securityEvents.length > 1000) {
            this.securityEvents.shift();
        }
    }
    getSecurityEvents(limit = 100) {
        return this.securityEvents
            .slice(-limit)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    getSecurityStats() {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const eventsByType = {};
        let recentEvents = 0;
        for (const event of this.securityEvents) {
            eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
            if (event.timestamp && event.timestamp > oneHourAgo) {
                recentEvents++;
            }
        }
        return {
            totalEvents: this.securityEvents.length,
            eventsByType,
            recentEvents,
        };
    }
};
exports.SecurityCheckerService = SecurityCheckerService;
exports.SecurityCheckerService = SecurityCheckerService = SecurityCheckerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], SecurityCheckerService);
//# sourceMappingURL=security-checker.service.js.map