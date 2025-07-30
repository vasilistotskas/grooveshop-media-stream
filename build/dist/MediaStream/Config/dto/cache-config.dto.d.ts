export declare class MemoryCacheConfigDto {
    maxSize: number;
    ttl: number;
    checkPeriod: number;
    useClones: boolean;
    deleteOnExpire: boolean;
}
export declare class RedisConfigDto {
    host: string;
    port: number;
    password?: string;
    db: number;
    ttl: number;
    maxRetries: number;
    retryDelayOnFailover: number;
}
export declare class FileCacheConfigDto {
    directory: string;
    maxSize: number;
    cleanupInterval: number;
}
export declare class CacheConfigDto {
    memory: MemoryCacheConfigDto;
    redis: RedisConfigDto;
    file: FileCacheConfigDto;
}
