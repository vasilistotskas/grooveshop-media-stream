export interface ServerConfig {
	port: number
	host: string
	cors: CorsConfig
}

export interface CorsConfig {
	origin: string[]
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

export interface ImageCacheConfig {
	publicTtl: number
	privateTtl: number
	negativeCacheTtl: number
}

export interface CacheConfig {
	memory: MemoryCacheConfig
	redis: RedisConfig
	file: FileCacheConfig
	image: ImageCacheConfig
}

export interface ProcessingConfig {
	cpuCores: number
	/** Concurrent Sharp pipelines; 0 derives ceil(cpuCores). */
	maxConcurrent: number
	/** Requests allowed to wait for a pipeline slot before 503. */
	maxQueue: number
	/** Longest wait for a slot before 503 (ms). */
	queueTimeoutMs: number
	/** Sharp per-pipeline timeout (seconds); 0 disables. */
	timeoutSeconds: number
	/** AVIF quality ceiling; a request above it is encoded (and cached) at it. */
	avifMaxQuality: number
}

export interface MonitoringConfig {
	enabled: boolean
	systemMetricsInterval: number
	performanceMetricsInterval: number
	/** Bearer token for `GET /metrics`; empty keeps the endpoint closed. */
	metricsToken: string
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

export interface RenditionStoreConfig {
	/** S3 API endpoint (`https://<account>.eu.r2.cloudflarestorage.com`); empty disables the store. */
	endpoint: string
	bucket: string
	accessKeyId: string
	secretAccessKey: string
	/** Longest a GET or HEAD may take before it counts as a miss (ms). */
	readTimeoutMs: number
	/** Longest a PUT, DELETE or LIST may take before it counts as failed (ms). */
	writeTimeoutMs: number
}

export interface RenditionSizesConfig {
	/** A size becomes exact once it was rendered for this many uploads. */
	minSources: number
	/** Days a size stays exact without being asked for; also how long its count is kept. */
	windowDays: number
	/** Most sizes exact at once; the least recently asked leaves first. */
	maxKnown: number
}

export interface RenditionsConfig {
	store: RenditionStoreConfig
	sizes: RenditionSizesConfig
	/** Root of the tenants' uploads (`{dir}/{tenantSchema}/uploads/...`); empty disables pre-generation. */
	mediaDirectory: string
	cronSchedule: string
	/** A rendition is pre-generated for a folder once it exists for this many different sources of it. */
	minSources: number
	/** Most renditions pre-generated per source. */
	maxPerSource: number
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
	renditions: RenditionsConfig
	shutdown: ShutdownConfig
}
