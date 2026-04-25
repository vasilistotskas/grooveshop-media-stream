export interface ImageProcessingJobData {
	correlationId: string
	imageUrl: string
	width?: number
	height?: number
	quality?: number
	format?: 'webp' | 'jpeg' | 'png'
	fit?: string
	position?: string
	background?: any
	trimThreshold?: number
	cacheKey: string
	priority: JobPriority
	metadata?: ImageMetadata
}

export interface CacheWarmingJobData {
	correlationId: string
	imageUrls: string[]
	priority: JobPriority
	batchSize?: number
}

export interface CacheCleanupJobData {
	correlationId: string
	maxAge: number
	maxSize: number
	priority: JobPriority
}

export interface ImageMetadata {
	originalSize?: number
	originalFormat?: string
	requestedAt: number
	clientIp?: string
	userAgent?: string
}

export enum JobPriority {
	LOW = 1,
	NORMAL = 5,
	HIGH = 10,
	CRITICAL = 15,
}

export enum JobType {
	IMAGE_PROCESSING = 'image-processing',
	CACHE_WARMING = 'cache-warming',
	CACHE_CLEANUP = 'cache-cleanup',
}

export interface JobResult {
	success: boolean
	/**
	 * Populated only by processors that return inline data (e.g. cache-operations).
	 * Image-processing jobs do NOT populate this field — they write the result to
	 * the multi-layer cache and return a `cacheKey` reference instead, so callers
	 * should read the processed image via MultiLayerCacheManager.get('image', cacheKey).
	 */
	data?: any
	/**
	 * Cache key under which the processed image was stored.
	 * Set by ImageProcessingProcessor on success; absent for cache-operations jobs.
	 */
	cacheKey?: string
	error?: string
	processingTime: number
	cacheHit?: boolean
}

export interface JobMetrics {
	totalJobs: number
	completedJobs: number
	failedJobs: number
	averageProcessingTime: number
	queueLength: number
	activeWorkers: number
}
