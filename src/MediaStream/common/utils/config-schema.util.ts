/**
 * Configuration schema utility for reducing repetitive config parsing
 */

export type ConfigType = 'string' | 'number' | 'boolean' | 'array'

export interface ConfigSchemaEntry {
	env: string
	default: any
	type: ConfigType
}

export type ConfigSchema = Record<string, ConfigSchemaEntry>

/**
 * Parse environment value based on type
 */
export function parseEnvValue(
	getValue: (key: string) => string | undefined,
	schema: ConfigSchemaEntry,
): any {
	const rawValue = getValue(schema.env)

	if (rawValue === undefined || rawValue === null || rawValue === '') {
		return schema.default
	}

	switch (schema.type) {
		case 'number': {
			// parseFloat (not parseInt) so fractional values like
			// PROCESSING_CPU_CORES=1.5 survive; invalid input falls back to the
			// schema default instead of propagating NaN into the config tree.
			const parsed = Number.parseFloat(rawValue)
			return Number.isNaN(parsed) ? schema.default : parsed
		}
		case 'boolean':
			return typeof rawValue === 'string'
				? rawValue.toLowerCase() === 'true'
				: Boolean(rawValue)
		case 'array':
			// Items are trimmed but NOT lowercased — entries such as health-check
			// URLs can be case-sensitive.
			return typeof rawValue === 'string'
				? rawValue.split(',').map(s => s.trim()).filter(s => s.length > 0)
				: rawValue
		case 'string':
		default:
			return rawValue
	}
}

/**
 * Build configuration object from schema
 */
export function buildConfigFromSchema<T>(
	getValue: (key: string) => string | undefined,
	schema: ConfigSchema,
): T {
	const result: Record<string, any> = {}

	for (const [path, entry] of Object.entries(schema)) {
		setNestedValue(result, path, parseEnvValue(getValue, entry))
	}

	return result as T
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Set a nested value in an object using dot notation path.
 * Guards against prototype pollution by rejecting unsafe keys.
 */
export function setNestedValue(obj: Record<string, any>, path: string, value: any): void {
	const keys = path.split('.')
	let current = obj

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i]
		if (UNSAFE_KEYS.has(key)) {
			throw new Error(`Unsafe key "${key}" in config path: ${path}`)
		}
		if (!(key in current)) {
			current[key] = {}
		}
		current = current[key]
	}

	const finalKey = keys.at(-1)!
	if (UNSAFE_KEYS.has(finalKey)) {
		throw new Error(`Unsafe key "${finalKey}" in config path: ${path}`)
	}
	current[finalKey] = value
}

/**
 * Configuration schema definition for the application
 */
export const APP_CONFIG_SCHEMA: ConfigSchema = {
	// Server configuration
	'server.port': { env: 'PORT', default: 3003, type: 'number' },
	'server.host': { env: 'HOST', default: '0.0.0.0', type: 'string' },
	'server.cors.origin': { env: 'CORS_ORIGIN', default: '*', type: 'string' },
	'server.cors.methods': { env: 'CORS_METHODS', default: 'GET', type: 'string' },
	'server.cors.maxAge': { env: 'CORS_MAX_AGE', default: 86400, type: 'number' },

	// Memory cache configuration
	'cache.memory.maxSize': { env: 'CACHE_MEMORY_MAX_SIZE', default: 104857600, type: 'number' },
	'cache.memory.defaultTtl': { env: 'CACHE_MEMORY_DEFAULT_TTL', default: 3600, type: 'number' },
	'cache.memory.checkPeriod': { env: 'CACHE_MEMORY_CHECK_PERIOD', default: 600, type: 'number' },
	'cache.memory.maxKeys': { env: 'CACHE_MEMORY_MAX_KEYS', default: 1000, type: 'number' },
	'cache.memory.warningThreshold': { env: 'CACHE_MEMORY_WARNING_THRESHOLD', default: 80, type: 'number' },

	// Redis configuration
	'cache.redis.host': { env: 'REDIS_HOST', default: 'localhost', type: 'string' },
	'cache.redis.port': { env: 'REDIS_PORT', default: 6379, type: 'number' },
	'cache.redis.password': { env: 'REDIS_PASSWORD', default: undefined, type: 'string' },
	'cache.redis.db': { env: 'REDIS_DB', default: 0, type: 'number' },
	'cache.redis.ttl': { env: 'REDIS_TTL', default: 7200, type: 'number' },
	'cache.redis.maxRetries': { env: 'REDIS_MAX_RETRIES', default: 3, type: 'number' },
	'cache.redis.retryDelayOnFailover': { env: 'REDIS_RETRY_DELAY', default: 100, type: 'number' },
	// TTL (ms) for memoising the Redis health probe result
	'cache.redis.healthCheckCacheTtl': { env: 'REDIS_HEALTH_CACHE_TTL', default: 10000, type: 'number' },

	// File cache configuration
	'cache.file.directory': { env: 'CACHE_FILE_DIRECTORY', default: './storage', type: 'string' },

	// Cache warming configuration
	'cache.warming.enabled': { env: 'CACHE_WARMING_ENABLED', default: true, type: 'boolean' },
	'cache.warming.warmupOnStart': { env: 'CACHE_WARMING_ON_START', default: true, type: 'boolean' },
	'cache.warming.maxFilesToWarm': { env: 'CACHE_WARMING_MAX_FILES', default: 50, type: 'number' },
	'cache.warming.warmupCron': { env: 'CACHE_WARMING_CRON', default: '0 */6 * * *', type: 'string' },
	'cache.warming.popularImageThreshold': { env: 'CACHE_WARMING_THRESHOLD', default: 5, type: 'number' },
	// Base TTL (seconds) for warmed entries; access count scales it up
	'cache.warming.baseTtl': { env: 'CACHE_WARMING_BASE_TTL', default: 3600, type: 'number' },

	// Popular-key preloading (multi-layer cache)
	'cache.preloading.enabled': { env: 'CACHE_PRELOADING_ENABLED', default: false, type: 'boolean' },
	'cache.preloading.interval': { env: 'CACHE_PRELOADING_INTERVAL', default: 300000, type: 'number' },

	// Image TTL configuration (in seconds — cache layers expect seconds)
	'cache.image.publicTtl': { env: 'CACHE_IMAGE_PUBLIC_TTL', default: 12 * 30 * 24 * 3600, type: 'number' },
	'cache.image.privateTtl': { env: 'CACHE_IMAGE_PRIVATE_TTL', default: 6 * 30 * 24 * 3600, type: 'number' },
	// Negative-cache TTL in seconds — suppresses retries for failed upstream fetches
	'cache.image.negativeCacheTtl': { env: 'CACHE_IMAGE_NEGATIVE_TTL', default: 300, type: 'number' },

	// Processing configuration — container CPU limit used to derive Sharp concurrency
	'processing.cpuCores': { env: 'PROCESSING_CPU_CORES', default: 1.5, type: 'number' },

	// Monitoring configuration
	'monitoring.enabled': { env: 'MONITORING_ENABLED', default: true, type: 'boolean' },
	'monitoring.systemMetricsInterval': { env: 'MONITORING_SYSTEM_METRICS_INTERVAL', default: 60000, type: 'number' },
	'monitoring.performanceMetricsInterval': { env: 'MONITORING_PERFORMANCE_METRICS_INTERVAL', default: 30000, type: 'number' },

	// External services configuration
	'externalServices.requestTimeout': { env: 'EXTERNAL_REQUEST_TIMEOUT', default: 30000, type: 'number' },

	// HTTP client configuration
	'http.timeout': { env: 'HTTP_TIMEOUT', default: 30000, type: 'number' },
	'http.maxRetries': { env: 'HTTP_MAX_RETRIES', default: 3, type: 'number' },
	'http.retryDelay': { env: 'HTTP_RETRY_DELAY', default: 1000, type: 'number' },
	'http.maxRetryDelay': { env: 'HTTP_MAX_RETRY_DELAY', default: 10000, type: 'number' },
	'http.connectionPool.maxSockets': { env: 'HTTP_POOL_MAX_SOCKETS', default: 50, type: 'number' },
	'http.connectionPool.keepAliveMsecs': { env: 'HTTP_POOL_KEEP_ALIVE_MS', default: 1000, type: 'number' },
	'http.circuitBreaker.enabled': { env: 'HTTP_CIRCUIT_BREAKER_ENABLED', default: true, type: 'boolean' },
	'http.circuitBreaker.failureThreshold': { env: 'HTTP_CIRCUIT_BREAKER_FAILURE_THRESHOLD', default: 50, type: 'number' },
	'http.circuitBreaker.resetTimeout': { env: 'HTTP_CIRCUIT_BREAKER_RESET_TIMEOUT', default: 30000, type: 'number' },
	'http.circuitBreaker.monitoringPeriod': { env: 'HTTP_CIRCUIT_BREAKER_MONITORING_PERIOD', default: 60000, type: 'number' },
	'http.circuitBreaker.minimumRequests': { env: 'HTTP_CIRCUIT_BREAKER_MINIMUM_REQUESTS', default: 10, type: 'number' },
	// Upstream endpoints probed by the HTTP health indicator (comma-separated; empty disables probing)
	'http.healthCheck.urls': { env: 'HTTP_HEALTH_CHECK_URLS', default: [], type: 'array' },
	'http.healthCheck.timeout': { env: 'HTTP_HEALTH_CHECK_TIMEOUT', default: 5000, type: 'number' },

	// Rate limit configuration
	'rateLimit.enabled': { env: 'RATE_LIMIT_ENABLED', default: true, type: 'boolean' },
	'rateLimit.default.windowMs': { env: 'RATE_LIMIT_DEFAULT_WINDOW_MS', default: 60000, type: 'number' },
	'rateLimit.default.max': { env: 'RATE_LIMIT_DEFAULT_MAX', default: 100, type: 'number' },
	'rateLimit.imageProcessing.windowMs': { env: 'RATE_LIMIT_IMAGE_PROCESSING_WINDOW_MS', default: 60000, type: 'number' },
	'rateLimit.imageProcessing.max': { env: 'RATE_LIMIT_IMAGE_PROCESSING_MAX', default: 50, type: 'number' },
	'rateLimit.healthCheck.windowMs': { env: 'RATE_LIMIT_HEALTH_CHECK_WINDOW_MS', default: 10000, type: 'number' },
	'rateLimit.healthCheck.max': { env: 'RATE_LIMIT_HEALTH_CHECK_MAX', default: 1000, type: 'number' },
	'rateLimit.bypass.healthChecks': { env: 'RATE_LIMIT_BYPASS_HEALTH_CHECKS', default: true, type: 'boolean' },
	'rateLimit.bypass.staticAssets': { env: 'RATE_LIMIT_BYPASS_STATIC_ASSETS', default: true, type: 'boolean' },
	'rateLimit.bypass.whitelistedDomains': { env: 'RATE_LIMIT_BYPASS_WHITELISTED_DOMAINS', default: '', type: 'string' },
	'rateLimit.bypass.bots': { env: 'RATE_LIMIT_BYPASS_BOTS', default: true, type: 'boolean' },

	// Input validation configuration
	'validation.allowedDomains': {
		env: 'VALIDATION_ALLOWED_DOMAINS',
		default: [
			'localhost',
			'127.0.0.1',
			'backend-service',
			'webside.gr',
			'assets.webside.gr',
			'api.webside.gr',
			'static.webside.gr',
			'static-svc',
			'frontend-nuxt-service',
			'media-stream-service',
		],
		type: 'array',
	},
	'validation.maxStringLength': { env: 'VALIDATION_MAX_STRING_LENGTH', default: 10000, type: 'number' },

	// Storage monitoring thresholds (bytes / file counts / days)
	'storage.maxSize': { env: 'STORAGE_MAX_SIZE', default: 1073741824, type: 'number' },
	'storage.maxFileAge': { env: 'STORAGE_MAX_FILE_AGE_DAYS', default: 30, type: 'number' },
	'storage.warningSize': { env: 'STORAGE_WARNING_SIZE', default: 838860800, type: 'number' },
	'storage.criticalSize': { env: 'STORAGE_CRITICAL_SIZE', default: 1073741824, type: 'number' },
	'storage.warningFileCount': { env: 'STORAGE_WARNING_FILE_COUNT', default: 5000, type: 'number' },
	'storage.criticalFileCount': { env: 'STORAGE_CRITICAL_FILE_COUNT', default: 10000, type: 'number' },

	// Storage cleanup (daily retention-policy cron)
	'storage.cleanup.enabled': { env: 'STORAGE_CLEANUP_ENABLED', default: true, type: 'boolean' },
	'storage.cleanup.cronSchedule': { env: 'STORAGE_CLEANUP_CRON', default: '0 2 * * *', type: 'string' },
	'storage.cleanup.dryRun': { env: 'STORAGE_CLEANUP_DRY_RUN', default: false, type: 'boolean' },
	'storage.cleanup.maxDuration': { env: 'STORAGE_CLEANUP_MAX_DURATION', default: 300000, type: 'number' },

	// Storage eviction
	'storage.eviction.strategy': { env: 'STORAGE_EVICTION_STRATEGY', default: 'intelligent', type: 'string' },
	'storage.eviction.aggressiveness': { env: 'STORAGE_EVICTION_AGGRESSIVENESS', default: 'moderate', type: 'string' },
	'storage.eviction.preservePopular': { env: 'STORAGE_EVICTION_PRESERVE_POPULAR', default: true, type: 'boolean' },
	'storage.eviction.minAccessCount': { env: 'STORAGE_EVICTION_MIN_ACCESS_COUNT', default: 5, type: 'number' },
	'storage.eviction.maxFileAge': { env: 'STORAGE_EVICTION_MAX_FILE_AGE_DAYS', default: 7, type: 'number' },

	// Storage optimization (compression / deduplication, every 6 hours)
	'storage.optimization.enabled': { env: 'STORAGE_OPTIMIZATION_ENABLED', default: true, type: 'boolean' },
	'storage.optimization.strategies': { env: 'STORAGE_OPTIMIZATION_STRATEGIES', default: ['deduplication'], type: 'array' },
	'storage.optimization.popularThreshold': { env: 'STORAGE_OPTIMIZATION_POPULAR_THRESHOLD', default: 10, type: 'number' },
	'storage.optimization.compressionLevel': { env: 'STORAGE_OPTIMIZATION_COMPRESSION_LEVEL', default: 6, type: 'number' },
	'storage.optimization.createBackups': { env: 'STORAGE_OPTIMIZATION_CREATE_BACKUPS', default: false, type: 'boolean' },
	'storage.optimization.maxTime': { env: 'STORAGE_OPTIMIZATION_MAX_TIME', default: 600000, type: 'number' },

	// Graceful shutdown configuration
	'shutdown.timeout': { env: 'SHUTDOWN_TIMEOUT', default: 30000, type: 'number' },
	'shutdown.forceTimeout': { env: 'SHUTDOWN_FORCE_TIMEOUT', default: 60000, type: 'number' },

	// Internal admin secret for /metrics and /health/circuit-breaker/reset
	'internal.adminSecret': { env: 'INTERNAL_ADMIN_SECRET', default: undefined, type: 'string' },
}
