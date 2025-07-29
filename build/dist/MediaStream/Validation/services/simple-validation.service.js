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
var SimpleValidationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleValidationService = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../Config/config.service");
const correlation_service_1 = require("../../Correlation/services/correlation.service");
const input_sanitization_service_1 = require("./input-sanitization.service");
const security_checker_service_1 = require("./security-checker.service");
let SimpleValidationService = SimpleValidationService_1 = class SimpleValidationService {
    constructor(configService, correlationService, sanitizationService, securityChecker) {
        this.configService = configService;
        this.correlationService = correlationService;
        this.sanitizationService = sanitizationService;
        this.securityChecker = securityChecker;
        this.logger = new common_1.Logger(SimpleValidationService_1.name);
    }
    async validateCacheImageRequest(request) {
        const errors = [];
        try {
            const isMalicious = await this.securityChecker.checkForMaliciousContent(request);
            if (isMalicious) {
                errors.push('Request contains potentially malicious content');
                await this.securityChecker.logSecurityEvent({
                    type: 'malicious_content',
                    source: 'simple_validation_service',
                    details: { resourceTarget: request.resourceTarget },
                    timestamp: new Date(),
                });
            }
            if (!this.sanitizationService.validateUrl(request.resourceTarget)) {
                errors.push('Invalid or disallowed URL');
            }
            const { width, height } = request.resizeOptions;
            if (width && height) {
                if (!this.sanitizationService.validateImageDimensions(width, height)) {
                    errors.push('Image dimensions exceed allowed limits');
                }
            }
            const sanitizedInput = await this.sanitizationService.sanitize(request);
            return {
                isValid: errors.length === 0,
                errors,
                sanitizedInput,
            };
        }
        catch (error) {
            this.logger.error('Validation error', error);
            return {
                isValid: false,
                errors: ['Validation service error'],
            };
        }
    }
    async validateInput(input) {
        const errors = [];
        try {
            const isMalicious = await this.securityChecker.checkForMaliciousContent(input);
            if (isMalicious) {
                errors.push('Input contains potentially malicious content');
            }
            const sanitizedInput = await this.sanitizationService.sanitize(input);
            return {
                isValid: errors.length === 0,
                errors,
                sanitizedInput,
            };
        }
        catch (error) {
            this.logger.error('Input validation error', error);
            return {
                isValid: false,
                errors: ['Input validation service error'],
            };
        }
    }
};
exports.SimpleValidationService = SimpleValidationService;
exports.SimpleValidationService = SimpleValidationService = SimpleValidationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService,
        correlation_service_1.CorrelationService,
        input_sanitization_service_1.InputSanitizationService,
        security_checker_service_1.SecurityCheckerService])
], SimpleValidationService);
//# sourceMappingURL=simple-validation.service.js.map