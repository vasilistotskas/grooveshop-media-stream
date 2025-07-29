import type { CacheKeyStrategy } from '../interfaces/cache-layer.interface';
export declare class DefaultCacheKeyStrategy implements CacheKeyStrategy {
    private readonly separator;
    private readonly hashAlgorithm;
    generateKey(namespace: string, identifier: string, params?: Record<string, any>): string;
    parseKey(key: string): {
        namespace: string;
        identifier: string;
        params?: Record<string, any>;
    };
    generateHash(input: string): string;
}
