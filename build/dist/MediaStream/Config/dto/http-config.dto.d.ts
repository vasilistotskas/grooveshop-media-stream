export declare class CircuitBreakerConfigDto {
    enabled: boolean;
    failureThreshold: number;
    resetTimeout: number;
    monitoringPeriod: number;
}
export declare class ConnectionPoolConfigDto {
    maxSockets: number;
    maxFreeSockets: number;
    timeout: number;
    keepAlive: boolean;
    keepAliveMsecs: number;
    connectTimeout: number;
}
export declare class RetryConfigDto {
    retries: number;
    retryDelay: number;
    retryDelayMultiplier: number;
    maxRetryDelay: number;
    retryOnTimeout: boolean;
    retryOnConnectionError: boolean;
}
export declare class HttpConfigDto {
    circuitBreaker: CircuitBreakerConfigDto;
    connectionPool: ConnectionPoolConfigDto;
    retry: RetryConfigDto;
}
