export interface RateLimitConfig {
    windowMs: number;
    max: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
    keyGenerator?: (req: any) => string;
}
export interface RateLimitInfo {
    limit: number;
    current: number;
    remaining: number;
    resetTime: Date;
}
export interface SystemLoadInfo {
    cpuUsage: number;
    memoryUsage: number;
    activeConnections: number;
}
export interface RateLimitBypassConfig {
    healthChecks: boolean;
    metricsEndpoint: boolean;
    staticAssets: boolean;
    customPaths: string[];
}
export interface AdaptiveRateLimitConfig {
    enabled: boolean;
    systemLoadThresholds: {
        cpu: number;
        memory: number;
        connections: number;
    };
    adjustmentFactors: {
        maxReduction: number;
        minLimit: number;
    };
}
export interface RateLimitMetrics {
    totalAttempts: number;
    totalBlocked: number;
    blockRate: number;
    currentRequests: number;
    adaptiveAdjustments: number;
}
export interface ClientRateLimitInfo {
    ip: string;
    requestType: string;
    currentCount: number;
    limit: number;
    resetTime: Date;
    blocked: boolean;
}
