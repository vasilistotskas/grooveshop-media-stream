import { MultiLayerCacheManager } from '../../Cache/services/multi-layer-cache.manager';
import { CorrelationService } from '../../Correlation/services/correlation.service';
import { HttpClientService } from '../../HTTP/services/http-client.service';
import { Job } from '../interfaces/job-queue.interface';
import { CacheCleanupJobData, CacheWarmingJobData, JobResult } from '../types/job.types';
export declare class CacheOperationsProcessor {
    private readonly _correlationService;
    private readonly cacheManager;
    private readonly httpClient;
    private readonly _logger;
    constructor(_correlationService: CorrelationService, cacheManager: MultiLayerCacheManager, httpClient: HttpClientService);
    processCacheWarming(job: Job<CacheWarmingJobData>): Promise<JobResult>;
    processCacheCleanup(job: Job<CacheCleanupJobData>): Promise<JobResult>;
    private warmCacheForImage;
    private cleanupMemoryCache;
    private cleanupFileCache;
    private generateCacheKey;
}
