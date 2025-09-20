"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestContext = exports.CorrelationId = void 0;
const common_1 = require("@nestjs/common");
const correlation_service_1 = require("../services/correlation.service");
exports.CorrelationId = (0, common_1.createParamDecorator)((_data, _ctx) => {
    const correlationService = new correlation_service_1.CorrelationService();
    return correlationService.getCorrelationId();
});
exports.RequestContext = (0, common_1.createParamDecorator)((_data, _ctx) => {
    const correlationService = new correlation_service_1.CorrelationService();
    return correlationService.getContext();
});
//# sourceMappingURL=correlation.decorator.js.map