"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationModule = void 0;
const common_1 = require("@nestjs/common");
const config_module_1 = require("../Config/config.module");
const correlation_module_1 = require("../Correlation/correlation.module");
const input_sanitization_service_1 = require("./services/input-sanitization.service");
const security_checker_service_1 = require("./services/security-checker.service");
const simple_validation_service_1 = require("./services/simple-validation.service");
let ValidationModule = class ValidationModule {
};
exports.ValidationModule = ValidationModule;
exports.ValidationModule = ValidationModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_module_1.ConfigModule,
            correlation_module_1.CorrelationModule,
        ],
        providers: [
            input_sanitization_service_1.InputSanitizationService,
            security_checker_service_1.SecurityCheckerService,
            simple_validation_service_1.SimpleValidationService,
        ],
        exports: [
            input_sanitization_service_1.InputSanitizationService,
            security_checker_service_1.SecurityCheckerService,
            simple_validation_service_1.SimpleValidationService,
        ],
    })
], ValidationModule);
//# sourceMappingURL=validation.module.js.map