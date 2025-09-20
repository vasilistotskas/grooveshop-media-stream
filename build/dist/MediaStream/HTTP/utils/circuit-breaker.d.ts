export declare enum CircuitState {
    CLOSED = "closed",
    OPEN = "open",
    HALF_OPEN = "half-open"
}
export interface CircuitBreakerOptions {
    failureThreshold: number;
    resetTimeout: number;
    rollingWindow: number;
    minimumRequests: number;
}
export declare class CircuitBreaker {
    private state;
    private failureCount;
    private successCount;
    private lastStateChange;
    private nextAttempt;
    private totalRequests;
    private readonly options;
    private readonly requestWindow;
    constructor(options: CircuitBreakerOptions);
    execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T>;
    recordSuccess(): void;
    recordFailure(): void;
    isOpen(): boolean;
    getState(): CircuitState;
    getStats(): {
        state: CircuitState;
        failureCount: number;
        successCount: number;
        totalRequests: number;
        failurePercentage: number;
        lastStateChange: number;
        nextAttempt: number;
    };
    reset(): void;
    private trip;
    private calculateFailurePercentage;
    private pruneWindow;
}
