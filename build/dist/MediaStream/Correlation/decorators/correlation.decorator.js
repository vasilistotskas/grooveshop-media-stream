import { createParamDecorator } from "@nestjs/common";
import { CorrelationService } from "../services/correlation.service.js";
/**
 * Decorator to inject correlation ID into controller methods
 */ export const CorrelationId = createParamDecorator((_data, _ctx)=>{
    const correlationService = new CorrelationService();
    return correlationService.getCorrelationId();
});
/**
 * Decorator to inject full request context into controller methods
 */ export const RequestContext = createParamDecorator((_data, _ctx)=>{
    const correlationService = new CorrelationService();
    return correlationService.getContext();
});

//# sourceMappingURL=correlation.decorator.js.map