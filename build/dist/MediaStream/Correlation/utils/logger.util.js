"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CorrelatedLogger = void 0;
const correlation_service_1 = require("../services/correlation.service");
class CorrelatedLogger {
    static log(message, context) {
        const correlationId = this.correlationService.getCorrelationId();
        const prefix = correlationId ? `[${correlationId}]` : '';
        const contextStr = context ? ` [${context}]` : '';
        console.log(`${prefix}${contextStr} ${message}`);
    }
    static error(message, trace, context) {
        const correlationId = this.correlationService.getCorrelationId();
        const prefix = correlationId ? `[${correlationId}]` : '';
        const contextStr = context ? ` [${context}]` : '';
        console.error(`${prefix}${contextStr} ERROR: ${message}`);
        if (trace) {
            console.error(`${prefix}${contextStr} TRACE: ${trace}`);
        }
    }
    static warn(message, context) {
        const correlationId = this.correlationService.getCorrelationId();
        const prefix = correlationId ? `[${correlationId}]` : '';
        const contextStr = context ? ` [${context}]` : '';
        console.warn(`${prefix}${contextStr} WARN: ${message}`);
    }
    static debug(message, context) {
        const correlationId = this.correlationService.getCorrelationId();
        const prefix = correlationId ? `[${correlationId}]` : '';
        const contextStr = context ? ` [${context}]` : '';
        console.debug(`${prefix}${contextStr} DEBUG: ${message}`);
    }
    static verbose(message, context) {
        const correlationId = this.correlationService.getCorrelationId();
        const prefix = correlationId ? `[${correlationId}]` : '';
        const contextStr = context ? ` [${context}]` : '';
        console.log(`${prefix}${contextStr} VERBOSE: ${message}`);
    }
}
exports.CorrelatedLogger = CorrelatedLogger;
CorrelatedLogger.correlationService = new correlation_service_1.CorrelationService();
//# sourceMappingURL=logger.util.js.map