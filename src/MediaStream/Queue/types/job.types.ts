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

export enum JobPriority {
	LOW = 1,
	NORMAL = 5,
	HIGH = 10,
	CRITICAL = 15,
}

export enum JobType {
	CACHE_WARMING = 'cache-warming',
	CACHE_CLEANUP = 'cache-cleanup',
}

export interface JobResult {
	success: boolean
	/** Populated by cache-operations processors with operation-specific result data. */
	data?: any
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
