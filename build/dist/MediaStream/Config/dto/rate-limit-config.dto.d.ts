export declare class RateLimitThrottlerConfigDto {
    windowMs: number;
    max: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
    constructor(data?: Partial<RateLimitThrottlerConfigDto>);
}
export declare class SystemLoadThresholdsDto {
    cpu: number;
    memory: number;
    connections: number;
}
export declare class AdaptiveConfigDto {
    enabled: boolean;
    systemLoadThresholds: SystemLoadThresholdsDto;
    maxReduction: number;
    minLimit: number;
}
export declare class BypassConfigDto {
    healthChecks: boolean;
    metricsEndpoint: boolean;
    staticAssets: boolean;
    customPaths: string[];
}
export declare class RateLimitConfigDto {
    default: RateLimitThrottlerConfigDto;
    imageProcessing: RateLimitThrottlerConfigDto;
    healthCheck: RateLimitThrottlerConfigDto;
    adaptive: AdaptiveConfigDto;
    bypass: BypassConfigDto;
    enabled: boolean;
    logBlocked: boolean;
}
