import { MultiLayerCacheManager } from '@microservice/Cache/services/multi-layer-cache.manager';
import { CorrelationService } from '@microservice/Correlation/services/correlation.service';
import { HttpClientService } from '@microservice/HTTP/services/http-client.service';
import { Job } from '../interfaces/job-queue.interface';
import { ImageProcessingJobData, JobResult } from '../types/job.types';
export declare class ImageProcessingProcessor {
    private readonly _correlationService;
    private readonly httpClient;
    private readonly cacheManager;
    private readonly _logger;
    private static readonly MAX_SHARP_INSTANCES;
    constructor(_correlationService: CorrelationService, httpClient: HttpClientService, cacheManager: MultiLayerCacheManager);
    process(job: Job<ImageProcessingJobData>): Promise<JobResult>;
    private downloadImage;
    private processImage;
    private updateProgress;
}
