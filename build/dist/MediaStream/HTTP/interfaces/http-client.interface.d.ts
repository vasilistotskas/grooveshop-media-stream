import { AxiosRequestConfig, AxiosResponse } from 'axios';
export interface HttpClientOptions {
    baseURL?: string;
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    maxRetryDelay?: number;
    retryStatusCodes?: number[];
    maxConcurrent?: number;
    keepAliveTimeout?: number;
    maxSockets?: number;
    circuitBreaker?: CircuitBreakerOptions;
    headers?: Record<string, string>;
    followRedirects?: boolean;
    maxRedirects?: number;
}
export interface CircuitBreakerOptions {
    failureThreshold: number;
    resetTimeout: number;
    rollingWindow: number;
    minimumRequests: number;
}
export interface HttpClientStats {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    retriedRequests: number;
    averageResponseTime: number;
    circuitBreakerState: 'closed' | 'open' | 'half-open';
    activeRequests: number;
    queueSize: number;
}
export interface IHttpClient {
    get: <T = any>(url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
    post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
    put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
    delete: <T = any>(url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
    head: <T = any>(url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
    patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
    request: <T = any>(config: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
    getStats: () => HttpClientStats;
    resetStats: () => void;
    isCircuitOpen: () => boolean;
    resetCircuitBreaker: () => void;
}
