import { CorrelationService } from "../services/correlation.service.js";
export class CorrelatedLogger {
    static{
        this._correlationService = null;
    }
    static setCorrelationService(service) {
        this._correlationService = service;
    }
    static getCorrelationService() {
        if (!this._correlationService) {
            this._correlationService = new CorrelationService();
        }
        return this._correlationService;
    }
    static log(message, context) {
        const correlationId = this.getCorrelationService().getCorrelationId();
        const prefix = correlationId ? `[${correlationId}]` : '';
        const contextStr = context ? ` [${context}]` : '';
        console.log(`${prefix}${contextStr} ${message}`);
    }
    static error(message, trace, context) {
        const correlationId = this.getCorrelationService().getCorrelationId();
        const prefix = correlationId ? `[${correlationId}]` : '';
        const contextStr = context ? ` [${context}]` : '';
        console.error(`${prefix}${contextStr} ERROR: ${message}`);
        if (trace) {
            console.error(`${prefix}${contextStr} TRACE: ${trace}`);
        }
    }
    static warn(message, context) {
        const correlationId = this.getCorrelationService().getCorrelationId();
        const prefix = correlationId ? `[${correlationId}]` : '';
        const contextStr = context ? ` [${context}]` : '';
        console.warn(`${prefix}${contextStr} WARN: ${message}`);
    }
    static debug(message, context) {
        const correlationId = this.getCorrelationService().getCorrelationId();
        const prefix = correlationId ? `[${correlationId}]` : '';
        const contextStr = context ? ` [${context}]` : '';
        console.debug(`${prefix}${contextStr} DEBUG: ${message}`);
    }
    static verbose(message, context) {
        const correlationId = this.getCorrelationService().getCorrelationId();
        const prefix = correlationId ? `[${correlationId}]` : '';
        const contextStr = context ? ` [${context}]` : '';
        console.log(`${prefix}${contextStr} VERBOSE: ${message}`);
    }
}

//# sourceMappingURL=logger.util.js.map