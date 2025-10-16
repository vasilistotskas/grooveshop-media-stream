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
export class BaseHealthIndicator {
    /**
	 * Public method to check health with error handling and metrics
	 */ async isHealthy() {
        const startTime = Date.now();
        try {
            const result = await this.performHealthCheck();
            const responseTime = Date.now() - startTime;
            this.lastCheck = {
                timestamp: Date.now(),
                status: 'healthy',
                responseTime,
                details: result[this.key] || {}
            };
            this.logger.debug(`Health check passed for ${this.key} in ${responseTime}ms`);
            return result;
        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.lastCheck = {
                timestamp: Date.now(),
                status: 'unhealthy',
                responseTime,
                details: {
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            };
            this.logger.warn(`Health check failed for ${this.key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                [this.key]: {
                    status: 'down',
                    message: error instanceof Error ? error.message : 'Health check failed',
                    timestamp: new Date().toISOString(),
                    responseTime
                }
            };
        }
    }
    /**
	 * Get details about this health indicator including last check results
	 */ getDetails() {
        return {
            key: this.key,
            options: this.options,
            lastCheck: this.lastCheck,
            description: this.getDescription()
        };
    }
    /**
	 * Get the last health check metrics
	 */ getLastCheck() {
        return this.lastCheck;
    }
    /**
	 * Helper method to create a healthy result
	 */ createHealthyResult(details = {}) {
        return {
            [this.key]: {
                status: 'up',
                timestamp: new Date().toISOString(),
                ...details
            }
        };
    }
    /**
	 * Helper method to create an unhealthy result
	 */ createUnhealthyResult(message, _details = {}) {
        throw new Error(`${this.key} health check failed: ${message}`);
    }
    /**
	 * Helper method to execute with timeout
	 */ async executeWithTimeout(operation, timeoutMs = this.options.timeout || 5000) {
        return new Promise((resolve, reject)=>{
            const timer = setTimeout(()=>{
                reject(new Error(`Health check timeout after ${timeoutMs}ms`));
            }, timeoutMs);
            operation().then(resolve).catch(reject).finally(()=>clearTimeout(timer));
        });
    }
    constructor(key, options = {}){
        this.key = key;
        this.logger = new Logger(`${this.constructor.name}`);
        this.options = {
            timeout: 5000,
            retries: 3,
            threshold: 0.8,
            ...options
        };
    }
}
BaseHealthIndicator = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String,
        typeof HealthCheckOptions === "undefined" ? Object : HealthCheckOptions
    ])
], BaseHealthIndicator);

//# sourceMappingURL=base-health-indicator.js.map