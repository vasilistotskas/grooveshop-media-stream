import type { CacheLayer, CacheLayerStats } from '../interfaces/cache-layer.interface';
import { ConfigService } from '@microservice/Config/config.service';
export declare class FileCacheLayer implements CacheLayer {
    private readonly _configService;
    private readonly layerName;
    private readonly priority;
    private readonly cacheDirectory;
    private stats;
    constructor(_configService: ConfigService);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    clear(): Promise<void>;
    getStats(): Promise<CacheLayerStats>;
    getLayerName(): string;
    getPriority(): number;
    private getFilePath;
    private ensureCacheDirectory;
}
