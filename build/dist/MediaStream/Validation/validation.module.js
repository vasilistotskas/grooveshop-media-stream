function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { Module } from "@nestjs/common";
import { ConfigModule } from "../Config/config.module.js";
import { CorrelationModule } from "../Correlation/correlation.module.js";
import { InputSanitizationService } from "./services/input-sanitization.service.js";
import { SecurityCheckerService } from "./services/security-checker.service.js";
import { SimpleValidationService } from "./services/simple-validation.service.js";
export class ValidationModule {
}
ValidationModule = _ts_decorate([
    Module({
        imports: [
            ConfigModule,
            CorrelationModule
        ],
        providers: [
            InputSanitizationService,
            SecurityCheckerService,
            SimpleValidationService
        ],
        exports: [
            InputSanitizationService,
            SecurityCheckerService,
            SimpleValidationService
        ]
    })
], ValidationModule);

//# sourceMappingURL=validation.module.js.map