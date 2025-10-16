import { CorrelatedLogger } from "../../Correlation/utils/logger.util.js";
export var CircuitState = /*#__PURE__*/ function(CircuitState) {
    CircuitState["CLOSED"] = "closed";
    CircuitState["OPEN"] = "open";
    CircuitState["HALF_OPEN"] = "half-open";
    return CircuitState;
}({});
export class CircuitBreaker {
    constructor(options){
        this.state = "closed";
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
            minimumRequests: options.minimumRequests || 5
        };
    }
    /**
	 * Execute a function with circuit breaker protection
	 */ async execute(fn, fallback) {
        if (this.isOpen()) {
            if (fallback) {
                CorrelatedLogger.warn('Circuit is open, using fallback', 'CircuitBreaker');
                return fallback();
            }
            throw new Error('Circuit breaker is open');
        }
        try {
            const result = await fn();
            this.recordSuccess();
            return result;
        } catch (error) {
            this.recordFailure();
            if (fallback) {
                CorrelatedLogger.warn(`Request failed, using fallback: ${error.message}`, 'CircuitBreaker');
                return fallback();
            }
            throw error;
        }
    }
    /**
	 * Record a successful request
	 */ recordSuccess() {
        this.successCount++;
        this.totalRequests++;
        this.requestWindow.push({
            timestamp: Date.now(),
            success: true
        });
        this.pruneWindow();
        if (this.state === "half-open") {
            CorrelatedLogger.log('Circuit breaker reset (successful request in half-open state)', 'CircuitBreaker');
            this.reset();
        }
    }
    /**
	 * Record a failed request
	 */ recordFailure() {
        this.failureCount++;
        this.totalRequests++;
        this.requestWindow.push({
            timestamp: Date.now(),
            success: false
        });
        this.pruneWindow();
        if (this.state === "half-open") {
            CorrelatedLogger.warn('Circuit breaker reopened (failed request in half-open state)', 'CircuitBreaker');
            this.trip();
            return;
        }
        const windowSize = this.requestWindow.length;
        if (windowSize < this.options.minimumRequests) {
            return;
        }
        const failurePercentage = this.calculateFailurePercentage();
        if (failurePercentage >= this.options.failureThreshold) {
            CorrelatedLogger.warn(`Circuit breaker tripped (failure rate: ${failurePercentage.toFixed(2)}%)`, 'CircuitBreaker');
            this.trip();
        }
    }
    /**
	 * Check if the circuit is open
	 */ isOpen() {
        if (this.state === "open") {
            const now = Date.now();
            if (now >= this.nextAttempt) {
                CorrelatedLogger.log('Circuit breaker entering half-open state', 'CircuitBreaker');
                this.state = "half-open";
                this.lastStateChange = now;
                return false;
            }
            return true;
        }
        return false;
    }
    /**
	 * Get the current state of the circuit breaker
	 */ getState() {
        return this.state;
    }
    /**
	 * Get circuit breaker statistics
	 */ getStats() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            totalRequests: this.totalRequests,
            failurePercentage: this.calculateFailurePercentage(),
            lastStateChange: this.lastStateChange,
            nextAttempt: this.nextAttempt
        };
    }
    /**
	 * Reset the circuit breaker
	 */ reset() {
        this.state = "closed";
        this.failureCount = 0;
        this.successCount = 0;
        this.totalRequests = 0;
        this.lastStateChange = Date.now();
        this.nextAttempt = 0;
        this.requestWindow.length = 0;
        CorrelatedLogger.log('Circuit breaker reset', 'CircuitBreaker');
    }
    /**
	 * Trip the circuit breaker
	 */ trip() {
        this.state = "open";
        this.lastStateChange = Date.now();
        this.nextAttempt = Date.now() + this.options.resetTimeout;
    }
    /**
	 * Calculate the failure percentage
	 */ calculateFailurePercentage() {
        this.pruneWindow();
        const windowSize = this.requestWindow.length;
        if (windowSize === 0) {
            return 0;
        }
        const failures = this.requestWindow.filter((r)=>!r.success).length;
        return failures / windowSize * 100;
    }
    /**
	 * Remove old entries from the request window
	 */ pruneWindow() {
        const now = Date.now();
        const cutoff = now - this.options.rollingWindow;
        let i = 0;
        while(i < this.requestWindow.length && this.requestWindow[i].timestamp < cutoff){
            i++;
        }
        if (i > 0) {
            this.requestWindow.splice(0, i);
        }
    }
}

//# sourceMappingURL=circuit-breaker.js.map