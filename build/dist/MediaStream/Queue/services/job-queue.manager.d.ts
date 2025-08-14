import { CorrelationService } from '@microservice/Correlation/services/correlation.service';
import { OnModuleInit } from '@nestjs/common';
import { Job, JobOptions } from '../interfaces/job-queue.interface';
import { CacheOperationsProcessor } from '../processors/cache-operations.processor';
import { ImageProcessingProcessor } from '../processors/image-processing.processor';
import { CacheCleanupJobData, CacheWarmingJobData, ImageProcessingJobData, JobMetrics } from '../types/job.types';
import { BullQueueService } from './bull-queue.service';
export declare class JobQueueManager implements OnModuleInit {
    private readonly queueService;
    private readonly imageProcessor;
    private readonly cacheProcessor;
    private readonly _correlationService;
    private readonly _logger;
    private readonly metrics;
    constructor(queueService: BullQueueService, imageProcessor: ImageProcessingProcessor, cacheProcessor: CacheOperationsProcessor, _correlationService: CorrelationService);
    onModuleInit(): Promise<void>;
    addImageProcessingJob(data: Omit<ImageProcessingJobData, 'correlationId'>, options?: Partial<JobOptions>): Promise<Job<ImageProcessingJobData>>;
    addCacheWarmingJob(data: Omit<CacheWarmingJobData, 'correlationId'>, options?: Partial<JobOptions>): Promise<Job<CacheWarmingJobData>>;
    addCacheCleanupJob(data: Omit<CacheCleanupJobData, 'correlationId'>, options?: Partial<JobOptions>): Promise<Job<CacheCleanupJobData>>;
    getJobById(jobId: string): Promise<Job | null>;
    removeJob(jobId: string): Promise<void>;
    pauseQueues(): Promise<void>;
    resumeQueues(): Promise<void>;
    getQueueStats(): Promise<JobMetrics>;
    cleanCompletedJobs(olderThan?: number): Promise<void>;
    cleanFailedJobs(olderThan?: number): Promise<void>;
    private setupJobProcessors;
    private updateMetrics;
}
