export interface ServerConfig {
	port: number
	host: string
	cors: CorsConfig
}

export interface CorsConfig {
	origin: string
	methods: string
	maxAge: number
}

export interface BackendConfig {
	/** Upstream Django API base URL; required in production. */
	url: string
}

export interface AdminConfig {
	/** Shared secret for internal admin endpoints; empty keeps them closed. */
	secret: string
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

export interface RateLimitBucketConfig {
	windowMs: number
	max: number
}

export interface RateLimitBypassConfig {
	healthChecks: boolean
	staticAssets: boolean
	whitelistedDomains: string[]
	bots: boolean
}

export interface RateLimitConfig {
	enabled: boolean
	default: RateLimitBucketConfig
	imageProcessing: RateLimitBucketConfig
	healthCheck: RateLimitBucketConfig
	bypass: RateLimitBypassConfig
}

export interface ValidationConfig {
	allowedDomains: string[]
	maxStringLength: number
}

export interface TenantDomainsConfig {
	/** Empty means "derive from backend.url" — see TenantDomainsService. */
	refreshUrl: string
	/** Empty disables the dynamic-domain feature entirely. */
	secret: string
	refreshIntervalMs: number
}

export interface StorageCleanupConfig {
	enabled: boolean
	cronSchedule: string
	dryRun: boolean
	maxDuration: number
}

export interface StorageEvictionConfig {
	/** Pairs with at least this many recorded cache hits are evicted last. */
	minAccessCount: number
}

export interface StorageConfig {
	warningSize: number
	criticalSize: number
	warningFileCount: number
	criticalFileCount: number
	cleanup: StorageCleanupConfig
	eviction: StorageEvictionConfig
}

export interface ShutdownConfig {
	timeout: number
	forceTimeout: number
}

export interface AppConfig {
	server: ServerConfig
	backend: BackendConfig
	admin: AdminConfig
	cache: CacheConfig
	processing: ProcessingConfig
	monitoring: MonitoringConfig
	http: HttpConfig
	rateLimit: RateLimitConfig
	validation: ValidationConfig
	tenantDomains: TenantDomainsConfig
	storage: StorageConfig
	shutdown: ShutdownConfig
}
