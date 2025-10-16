function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { Injectable, Logger } from "@nestjs/common";
import { InputSanitizationService } from "./input-sanitization.service.js";
import { SecurityCheckerService } from "./security-checker.service.js";
export class SimpleValidationService {
    async validateCacheImageRequest(request) {
        const errors = [];
        try {
            const isMalicious = await this.securityChecker.checkForMaliciousContent(request);
            if (isMalicious) {
                errors.push('Request contains potentially malicious content');
                await this.securityChecker.logSecurityEvent({
                    type: 'malicious_content',
                    source: 'simple_validation_service',
                    details: {
                        resourceTarget: request.resourceTarget
                    },
                    timestamp: new Date()
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
                sanitizedInput
            };
        } catch (error) {
            this._logger.error('Validation error', error);
            return {
                isValid: false,
                errors: [
                    'Validation service error'
                ]
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
                sanitizedInput
            };
        } catch (error) {
            this._logger.error('Input validation error', error);
            return {
                isValid: false,
                errors: [
                    'Input validation service error'
                ]
            };
        }
    }
    constructor(sanitizationService, securityChecker){
        this.sanitizationService = sanitizationService;
        this.securityChecker = securityChecker;
        this._logger = new Logger(SimpleValidationService.name);
    }
}
SimpleValidationService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof InputSanitizationService === "undefined" ? Object : InputSanitizationService,
        typeof SecurityCheckerService === "undefined" ? Object : SecurityCheckerService
    ])
], SimpleValidationService);

//# sourceMappingURL=simple-validation.service.js.map