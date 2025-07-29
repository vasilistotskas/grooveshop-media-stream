export interface ImageProcessingJobData {
    correlationId: string;
    imageUrl: string;
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'jpeg' | 'png';
    cacheKey: string;
    priority: JobPriority;
    metadata?: ImageMetadata;
}
export interface CacheWarmingJobData {
    correlationId: string;
    imageUrls: string[];
    priority: JobPriority;
    batchSize?: number;
}
export interface CacheCleanupJobData {
    correlationId: string;
    maxAge: number;
    maxSize: number;
    priority: JobPriority;
}
export interface ImageMetadata {
    originalSize?: number;
    originalFormat?: string;
    requestedAt: number;
    clientIp?: string;
    userAgent?: string;
}
export declare enum JobPriority {
    LOW = 1,
    NORMAL = 5,
    HIGH = 10,
    CRITICAL = 15
}
export declare enum JobType {
    IMAGE_PROCESSING = "image-processing",
    CACHE_WARMING = "cache-warming",
    CACHE_CLEANUP = "cache-cleanup"
}
export interface JobResult {
    success: boolean;
    data?: any;
    error?: string;
    processingTime: number;
    cacheHit?: boolean;
}
export interface JobMetrics {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    averageProcessingTime: number;
    queueLength: number;
    activeWorkers: number;
}
