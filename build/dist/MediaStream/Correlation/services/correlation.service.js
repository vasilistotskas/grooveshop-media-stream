function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
export class CorrelationService {
    /**
	 * Generate a new correlation ID using UUID v4
	 */ generateCorrelationId() {
        return randomUUID();
    }
    /**
	 * Set the request context for the current async context
	 */ setContext(context) {
        this.asyncLocalStorage.enterWith(context);
    }
    /**
	 * Get the current request context
	 */ getContext() {
        return this.asyncLocalStorage.getStore() || null;
    }
    /**
	 * Get the correlation ID from the current context
	 */ getCorrelationId() {
        const context = this.getContext();
        return context?.correlationId || null;
    }
    /**
	 * Clear the current context (mainly for testing)
	 */ clearContext() {
        this.asyncLocalStorage.disable();
    }
    /**
	 * Run a function within a specific correlation context
	 */ runWithContext(context, fn) {
        return this.asyncLocalStorage.run(context, fn);
    }
    /**
	 * Update the current context with additional data
	 */ updateContext(updates) {
        const currentContext = this.getContext();
        if (currentContext) {
            const updatedContext = {
                ...currentContext,
                ...updates
            };
            this.setContext(updatedContext);
        }
    }
    /**
	 * Get the client IP from the current context
	 */ getClientIp() {
        const context = this.getContext();
        return context?.clientIp || 'unknown';
    }
    /**
	 * Get the user agent from the current context
	 */ getUserAgent() {
        const context = this.getContext();
        return context?.userAgent || 'unknown';
    }
    constructor(){
        this.asyncLocalStorage = new AsyncLocalStorage();
    }
}
CorrelationService = _ts_decorate([
    Injectable()
], CorrelationService);

//# sourceMappingURL=correlation.service.js.map