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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseHealthIndicator = void 0;
const common_1 = require("@nestjs/common");
let BaseHealthIndicator = class BaseHealthIndicator {
    constructor(key, options = {}) {
        this.key = key;
        this.logger = new common_1.Logger(`${this.constructor.name}`);
        this.options = {
            timeout: 5000,
            retries: 3,
            threshold: 0.8,
            ...options,
        };
    }
    async isHealthy() {
        const startTime = Date.now();
        try {
            const result = await this.performHealthCheck();
            const responseTime = Date.now() - startTime;
            this.lastCheck = {
                timestamp: Date.now(),
                status: 'healthy',
                responseTime,
                details: result[this.key] || {},
            };
            this.logger.debug(`Health check passed for ${this.key} in ${responseTime}ms`);
            return result;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            this.lastCheck = {
                timestamp: Date.now(),
                status: 'unhealthy',
                responseTime,
                details: { error: error instanceof Error ? error.message : 'Unknown error' },
            };
            this.logger.warn(`Health check failed for ${this.key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                [this.key]: {
                    status: 'down',
                    message: error instanceof Error ? error.message : 'Health check failed',
                    timestamp: new Date().toISOString(),
                    responseTime,
                },
            };
        }
    }
    getDetails() {
        return {
            key: this.key,
            options: this.options,
            lastCheck: this.lastCheck,
            description: this.getDescription(),
        };
    }
    getLastCheck() {
        return this.lastCheck;
    }
    createHealthyResult(details = {}) {
        return {
            [this.key]: {
                status: 'up',
                timestamp: new Date().toISOString(),
                ...details,
            },
        };
    }
    createUnhealthyResult(message, _details = {}) {
        throw new Error(`${this.key} health check failed: ${message}`);
    }
    async executeWithTimeout(operation, timeoutMs = this.options.timeout || 5000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Health check timeout after ${timeoutMs}ms`));
            }, timeoutMs);
            operation()
                .then(resolve)
                .catch(reject)
                .finally(() => clearTimeout(timer));
        });
    }
};
exports.BaseHealthIndicator = BaseHealthIndicator;
exports.BaseHealthIndicator = BaseHealthIndicator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [String, Object])
], BaseHealthIndicator);
//# sourceMappingURL=base-health-indicator.js.map