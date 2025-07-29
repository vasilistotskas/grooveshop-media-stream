"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CorrelationService = void 0;
const node_async_hooks_1 = require("node:async_hooks");
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
let CorrelationService = class CorrelationService {
    constructor() {
        this.asyncLocalStorage = new node_async_hooks_1.AsyncLocalStorage();
    }
    generateCorrelationId() {
        return (0, node_crypto_1.randomUUID)();
    }
    setContext(context) {
        this.asyncLocalStorage.enterWith(context);
    }
    getContext() {
        return this.asyncLocalStorage.getStore() || null;
    }
    getCorrelationId() {
        const context = this.getContext();
        return context?.correlationId || null;
    }
    clearContext() {
        this.asyncLocalStorage.disable();
    }
    runWithContext(context, fn) {
        return this.asyncLocalStorage.run(context, fn);
    }
    updateContext(updates) {
        const currentContext = this.getContext();
        if (currentContext) {
            const updatedContext = { ...currentContext, ...updates };
            this.setContext(updatedContext);
        }
    }
    getClientIp() {
        const context = this.getContext();
        return context?.clientIp || 'unknown';
    }
    getUserAgent() {
        const context = this.getContext();
        return context?.userAgent || 'unknown';
    }
};
exports.CorrelationService = CorrelationService;
exports.CorrelationService = CorrelationService = __decorate([
    (0, common_1.Injectable)()
], CorrelationService);
//# sourceMappingURL=correlation.service.js.map