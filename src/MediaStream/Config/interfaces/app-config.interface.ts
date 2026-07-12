export interface ServerConfig {
	port: number
	host: string
	cors: CorsConfig
}

export interface CorsConfig {
	origin: string | string[]
	methods: string
	maxAge: number
}

export interface MemoryCacheConfig {
	maxSize: number
	defaultTtl: number
	checkPeriod: number
	maxKeys: number
	warningThreshold: number
}

export interface RedisConfig {
	host: string
	port: number
	password?: string
	db: number
	ttl: number
	maxRetries: number
	retryDelayOnFailover: number
	healthCheckCacheTtl: number
}

export interface FileCacheConfig {
	directory: string
}

export interface CacheWarmingConfig {
	enabled: boolean
	warmupOnStart: boolean
	maxFilesToWarm: number
	warmupCron: string
	popularImageThreshold: number
	baseTtl: number
}

export interface CachePreloadingConfig {
	enabled: boolean
	interval: number
}

export interface ImageCacheConfig {
	publicTtl: number
	privateTtl: number
	negativeCacheTtl: number
}

export interface CacheConfig {
	memory: MemoryCacheConfig
	redis: RedisConfig
	file: FileCacheConfig
	warming: CacheWarmingConfig
	preloading: CachePreloadingConfig
	image: ImageCacheConfig
}

export interface ProcessingConfig {
	cpuCores: number
}

export interface MonitoringConfig {
	enabled: boolean
	systemMetricsInterval: number
	performanceMetricsInterval: number
}

export interface ExternalServicesConfig {
	requestTimeout: number
}

export interface CircuitBreakerConfig {
	enabled: boolean
	failureThreshold: number
	resetTimeout: number
	monitoringPeriod: number
	minimumRequests: number
}

export interface ConnectionPoolConfig {
	maxSockets: number
	keepAliveMsecs: number
}

export interface HttpHealthCheckConfig {
	urls: string[]
	timeout: number
}

export interface HttpConfig {
	timeout: number
	maxRetries: number
	retryDelay: number
	maxRetryDelay: number
	connectionPool: ConnectionPoolConfig
	circuitBreaker: CircuitBreakerConfig
	healthCheck: HttpHealthCheckConfig
}

export interface RateLimitThrottlerConfig {
	windowMs: number
	max: number
}

export interface RateLimitBypassConfig {
	healthChecks: boolean
	metricsEndpoint: boolean
	staticAssets: boolean
	whitelistedDomains: string
	bots: boolean
}

export interface RateLimitConfig {
	enabled: boolean
	default: RateLimitThrottlerConfig
	imageProcessing: RateLimitThrottlerConfig
	healthCheck: RateLimitThrottlerConfig
	bypass: RateLimitBypassConfig
}

export interface ValidationConfig {
	allowedDomains: string[]
	maxStringLength: number
}

export interface StorageCleanupConfig {
	enabled: boolean
	cronSchedule: string
	dryRun: boolean
	maxDuration: number
}

export interface StorageEvictionConfig {
	strategy: string
	aggressiveness: string
	preservePopular: boolean
	minAccessCount: number
	maxFileAge: number
}

export interface StorageOptimizationConfig {
	enabled: boolean
	strategies: string[]
	popularThreshold: number
	compressionLevel: number
	createBackups: boolean
	maxTime: number
}

export interface StorageConfig {
	maxSize: number
	maxFileAge: number
	warningSize: number
	criticalSize: number
	warningFileCount: number
	criticalFileCount: number
	cleanup: StorageCleanupConfig
	eviction: StorageEvictionConfig
	optimization: StorageOptimizationConfig
}

export interface ShutdownConfig {
	timeout: number
	forceTimeout: number
}

export interface InternalConfig {
	adminSecret?: string
}

export interface AppConfig {
	server: ServerConfig
	cache: CacheConfig
	processing: ProcessingConfig
	monitoring: MonitoringConfig
	externalServices: ExternalServicesConfig
	http: HttpConfig
	rateLimit: RateLimitConfig
	validation: ValidationConfig
	storage: StorageConfig
	shutdown: ShutdownConfig
	internal: InternalConfig
}
