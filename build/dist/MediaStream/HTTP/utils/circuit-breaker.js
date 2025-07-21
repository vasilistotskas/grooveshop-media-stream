"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = exports.CircuitState = void 0;
const logger_util_1 = require("../../Correlation/utils/logger.util");
var CircuitState;
(function (CircuitState) {
    CircuitState["CLOSED"] = "closed";
    CircuitState["OPEN"] = "open";
    CircuitState["HALF_OPEN"] = "half-open";
})(CircuitState || (exports.CircuitState = CircuitState = {}));
class CircuitBreaker {
    constructor(options) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastStateChange = Date.now();
        this.nextAttempt = 0;
        this.totalRequests = 0;
        this.requestWindow = [];
        this.options = {
            failureThreshold: options.failureThreshold || 50,
            resetTimeout: options.resetTimeout || 30000,
            rollingWindow: options.rollingWindow || 60000,
            minimumRequests: options.minimumRequests || 5,
        };
    }
    async execute(fn, fallback) {
        if (this.isOpen()) {
            if (fallback) {
                logger_util_1.CorrelatedLogger.warn('Circuit is open, using fallback', 'CircuitBreaker');
                return fallback();
            }
            throw new Error('Circuit breaker is open');
        }
        try {
            this.totalRequests++;
            const result = await fn();
            this.recordSuccess();
            return result;
        }
        catch (error) {
            this.recordFailure();
            if (fallback) {
                logger_util_1.CorrelatedLogger.warn(`Request failed, using fallback: ${error.message}`, 'CircuitBreaker');
                return fallback();
            }
            throw error;
        }
    }
    recordSuccess() {
        this.successCount++;
        this.requestWindow.push({ timestamp: Date.now(), success: true });
        this.pruneWindow();
        if (this.state === CircuitState.HALF_OPEN) {
            logger_util_1.CorrelatedLogger.log('Circuit breaker reset (successful request in half-open state)', 'CircuitBreaker');
            this.reset();
        }
    }
    recordFailure() {
        this.failureCount++;
        this.requestWindow.push({ timestamp: Date.now(), success: false });
        this.pruneWindow();
        if (this.state === CircuitState.HALF_OPEN) {
            logger_util_1.CorrelatedLogger.warn('Circuit breaker reopened (failed request in half-open state)', 'CircuitBreaker');
            this.trip();
            return;
        }
        const windowSize = this.requestWindow.length;
        if (windowSize < this.options.minimumRequests) {
            return;
        }
        const failurePercentage = this.calculateFailurePercentage();
        if (failurePercentage >= this.options.failureThreshold) {
            logger_util_1.CorrelatedLogger.warn(`Circuit breaker tripped (failure rate: ${failurePercentage.toFixed(2)}%)`, 'CircuitBreaker');
            this.trip();
        }
    }
    isOpen() {
        if (this.state === CircuitState.OPEN) {
            const now = Date.now();
            if (now >= this.nextAttempt) {
                logger_util_1.CorrelatedLogger.log('Circuit breaker entering half-open state', 'CircuitBreaker');
                this.state = CircuitState.HALF_OPEN;
                this.lastStateChange = now;
                return false;
            }
            return true;
        }
        return false;
    }
    getState() {
        return this.state;
    }
    getStats() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            totalRequests: this.totalRequests,
            failurePercentage: this.calculateFailurePercentage(),
            lastStateChange: this.lastStateChange,
            nextAttempt: this.nextAttempt,
        };
    }
    reset() {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastStateChange = Date.now();
        this.nextAttempt = 0;
        this.requestWindow.length = 0;
        logger_util_1.CorrelatedLogger.log('Circuit breaker reset', 'CircuitBreaker');
    }
    trip() {
        this.state = CircuitState.OPEN;
        this.lastStateChange = Date.now();
        this.nextAttempt = Date.now() + this.options.resetTimeout;
    }
    calculateFailurePercentage() {
        this.pruneWindow();
        const windowSize = this.requestWindow.length;
        if (windowSize === 0) {
            return 0;
        }
        const failures = this.requestWindow.filter(r => !r.success).length;
        return (failures / windowSize) * 100;
    }
    pruneWindow() {
        const now = Date.now();
        const cutoff = now - this.options.rollingWindow;
        const initialLength = this.requestWindow.length;
        let i = 0;
        while (i < this.requestWindow.length && this.requestWindow[i].timestamp < cutoff) {
            i++;
        }
        if (i > 0) {
            this.requestWindow.splice(0, i);
        }
    }
}
exports.CircuitBreaker = CircuitBreaker;
//# sourceMappingURL=circuit-breaker.js.map