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
		case 'number':
			return Number.parseInt(rawValue, 10)
		case 'boolean':
			return typeof rawValue === 'string'
				? rawValue.toLowerCase() === 'true'
				: Boolean(rawValue)
		case 'array':
			return typeof rawValue === 'string'
				? rawValue.split(',').map(s => s.trim().toLowerCase())
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

/**
 * Set a nested value in an object using dot notation path
 */
export function setNestedValue(obj: Record<string, any>, path: string, value: any): void {
	const keys = path.split('.')
	let current = obj

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i]
		if (!(key in current)) {
			current[key] = {}
		}
		current = current[key]
	}

	current[keys[keys.length - 1]] = value
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

	// File cache configuration
	'cache.file.directory': { env: 'CACHE_FILE_DIRECTORY', default: './storage', type: 'string' },
	'cache.file.maxSize': { env: 'CACHE_FILE_MAX_SIZE', default: 1073741824, type: 'number' },
	'cache.file.cleanupInterval': { env: 'CACHE_FILE_CLEANUP_INTERVAL', default: 3600, type: 'number' },

	// Cache warming configuration
	'cache.warming.enabled': { env: 'CACHE_WARMING_ENABLED', default: true, type: 'boolean' },
	'cache.warming.warmupOnStart': { env: 'CACHE_WARMING_ON_START', default: true, type: 'boolean' },
	'cache.warming.maxFilesToWarm': { env: 'CACHE_WARMING_MAX_FILES', default: 50, type: 'number' },
	'cache.warming.warmupCron': { env: 'CACHE_WARMING_CRON', default: '0 */6 * * *', type: 'string' },
	'cache.warming.popularImageThreshold': { env: 'CACHE_WARMING_THRESHOLD', default: 5, type: 'number' },

	// Image TTL configuration
	'cache.image.publicTtl': { env: 'CACHE_IMAGE_PUBLIC_TTL', default: 12 * 30 * 24 * 60 * 60 * 1000, type: 'number' },
	'cache.image.privateTtl': { env: 'CACHE_IMAGE_PRIVATE_TTL', default: 6 * 30 * 24 * 60 * 60 * 1000, type: 'number' },

	// Processing configuration
	'processing.maxConcurrent': { env: 'PROCESSING_MAX_CONCURRENT', default: 10, type: 'number' },
	'processing.timeout': { env: 'PROCESSING_TIMEOUT', default: 30000, type: 'number' },
	'processing.retries': { env: 'PROCESSING_RETRIES', default: 3, type: 'number' },
	'processing.maxFileSize': { env: 'PROCESSING_MAX_FILE_SIZE', default: 10485760, type: 'number' },
	'processing.allowedFormats': { env: 'PROCESSING_ALLOWED_FORMATS', default: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'], type: 'array' },

	// Monitoring configuration
	'monitoring.enabled': { env: 'MONITORING_ENABLED', default: true, type: 'boolean' },
	'monitoring.metricsPort': { env: 'MONITORING_METRICS_PORT', default: 9090, type: 'number' },
	'monitoring.healthPath': { env: 'MONITORING_HEALTH_PATH', default: '/health', type: 'string' },
	'monitoring.metricsPath': { env: 'MONITORING_METRICS_PATH', default: '/metrics', type: 'string' },

	// External services configuration
	'externalServices.requestTimeout': { env: 'EXTERNAL_REQUEST_TIMEOUT', default: 30000, type: 'number' },
	'externalServices.maxRetries': { env: 'EXTERNAL_MAX_RETRIES', default: 3, type: 'number' },

	// Rate limit configuration
	'rateLimit.enabled': { env: 'RATE_LIMIT_ENABLED', default: true, type: 'boolean' },
	'rateLimit.default.windowMs': { env: 'RATE_LIMIT_DEFAULT_WINDOW_MS', default: 60000, type: 'number' },
	'rateLimit.default.max': { env: 'RATE_LIMIT_DEFAULT_MAX', default: 100, type: 'number' },
	'rateLimit.imageProcessing.windowMs': { env: 'RATE_LIMIT_IMAGE_PROCESSING_WINDOW_MS', default: 60000, type: 'number' },
	'rateLimit.imageProcessing.max': { env: 'RATE_LIMIT_IMAGE_PROCESSING_MAX', default: 50, type: 'number' },
	'rateLimit.healthCheck.windowMs': { env: 'RATE_LIMIT_HEALTH_CHECK_WINDOW_MS', default: 10000, type: 'number' },
	'rateLimit.healthCheck.max': { env: 'RATE_LIMIT_HEALTH_CHECK_MAX', default: 1000, type: 'number' },
	'rateLimit.bypass.healthChecks': { env: 'RATE_LIMIT_BYPASS_HEALTH_CHECKS', default: true, type: 'boolean' },
	'rateLimit.bypass.metricsEndpoint': { env: 'RATE_LIMIT_BYPASS_METRICS_ENDPOINT', default: true, type: 'boolean' },
	'rateLimit.bypass.staticAssets': { env: 'RATE_LIMIT_BYPASS_STATIC_ASSETS', default: true, type: 'boolean' },
	'rateLimit.bypass.whitelistedDomains': { env: 'RATE_LIMIT_BYPASS_WHITELISTED_DOMAINS', default: '', type: 'string' },
	'rateLimit.bypass.bots': { env: 'RATE_LIMIT_BYPASS_BOTS', default: true, type: 'boolean' },

	// Graceful shutdown configuration
	'shutdown.timeout': { env: 'SHUTDOWN_TIMEOUT', default: 30000, type: 'number' },
	'shutdown.forceTimeout': { env: 'SHUTDOWN_FORCE_TIMEOUT', default: 60000, type: 'number' },
}
