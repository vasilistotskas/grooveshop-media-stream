import { MultiLayerCacheManager } from '../../Cache/services/multi-layer-cache.manager';
import { CorrelationService } from '../../Correlation/services/correlation.service';
import { HttpClientService } from '../../HTTP/services/http-client.service';
import { Job } from '../interfaces/job-queue.interface';
import { ImageProcessingJobData, JobResult } from '../types/job.types';
export declare class ImageProcessingProcessor {
    private readonly correlationService;
    private readonly httpClient;
    private readonly cacheManager;
    private readonly logger;
    constructor(correlationService: CorrelationService, httpClient: HttpClientService, cacheManager: MultiLayerCacheManager);
    process(job: Job<ImageProcessingJobData>): Promise<JobResult>;
    private downloadImage;
    private processImage;
    private updateProgress;
}
