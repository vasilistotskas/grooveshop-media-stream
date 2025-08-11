export interface ServerConfig {
    port: number;
    host: string;
    cors: CorsConfig;
}
export interface CorsConfig {
    origin: string | string[];
    methods: string;
    maxAge: number;
}
export interface MemoryCacheConfig {
    maxSize: number;
    defaultTtl: number;
    checkPeriod: number;
    maxKeys: number;
    _warningThreshold: number;
}
export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
    ttl: number;
    maxRetries: number;
    retryDelayOnFailover: number;
}
export interface FileCacheConfig {
    directory: string;
    maxSize: number;
    cleanupInterval: number;
}
export interface CacheWarmingConfig {
    enabled: boolean;
    warmupOnStart: boolean;
    maxFilesToWarm: number;
    warmupCron: string;
    popularImageThreshold: number;
}
export interface CacheConfig {
    memory: MemoryCacheConfig;
    redis: RedisConfig;
    file: FileCacheConfig;
    warming: CacheWarmingConfig;
}
export interface ProcessingConfig {
    maxConcurrent: number;
    timeout: number;
    retries: number;
    maxFileSize: number;
    allowedFormats: string[];
}
export interface MonitoringConfig {
    enabled: boolean;
    metricsPort: number;
    healthPath: string;
    metricsPath: string;
}
export interface ExternalServicesConfig {
    djangoUrl: string;
    nuxtUrl: string;
    requestTimeout: number;
    maxRetries: number;
}
export interface AppConfig {
    server: ServerConfig;
    cache: CacheConfig;
    processing: ProcessingConfig;
    monitoring: MonitoringConfig;
    externalServices: ExternalServicesConfig;
}
