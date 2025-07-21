import type { AppConfig } from './interfaces/app-config.interface'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService as NestConfigService } from '@nestjs/config'

@Injectable()
export class ConfigService implements OnModuleInit {
	private readonly logger = new Logger(ConfigService.name)
	private config: AppConfig
	private readonly hotReloadableKeys = new Set([
		'MONITORING_ENABLED',
		'PROCESSING_MAX_CONCURRENT',
		'CACHE_MEMORY_DEFAULT_TTL',
		'CACHE_FILE_CLEANUP_INTERVAL',
	])

	constructor(private readonly nestConfigService: NestConfigService) {
		this.config = this.loadAndValidateConfig()
	}

	async onModuleInit(): Promise<void> {
		this.logger.log('Configuration loaded and validated successfully')
	}

	/**
	 * Get a configuration value by key with type safety
	 */
	get<T = any>(key: string): T {
		const keys = key.split('.')
		let value: any = this.config

		for (const k of keys) {
			value = value?.[k]
		}

		if (value === undefined) {
			throw new Error(`Configuration key '${key}' not found`)
		}

		return value as T
	}

	/**
	 * Get an optional configuration value with default fallback
	 */
	getOptional<T = any>(key: string, defaultValue?: T): T {
		try {
			return this.get<T>(key)
		}
		catch {
			return defaultValue as T
		}
	}

	/**
	 * Get the entire configuration object
	 */
	getAll(): AppConfig {
		return { ...this.config }
	}

	/**
	 * Validate the current configuration
	 */
	async validate(): Promise<void> {
		// Basic validation - ensure required values are present and valid
		const config = this.config

		if (!config.server.port || config.server.port < 1 || config.server.port > 65535) {
			throw new Error('Invalid server port configuration')
		}

		if (!config.server.host) {
			throw new Error('Invalid server host configuration')
		}

		if (!config.externalServices.djangoUrl || !config.externalServices.nuxtUrl) {
			throw new Error('Invalid external services configuration')
		}

		this.logger.log('Configuration validation passed')
	}

	/**
	 * Reload configuration for hot-reloadable settings
	 */
	async reload(): Promise<void> {
		this.logger.log('Reloading hot-reloadable configuration...')

		const newConfig = this.loadConfig()

		// Only update hot-reloadable settings
		this.updateHotReloadableSettings(newConfig)

		this.logger.log('Hot-reloadable configuration updated successfully')
	}

	/**
	 * Check if a configuration key supports hot-reload
	 */
	isHotReloadable(key: string): boolean {
		return this.hotReloadableKeys.has(key)
	}

	private loadAndValidateConfig(): AppConfig {
		return this.loadConfig()
	}

	private loadConfig(): AppConfig {
		// Server configuration
		const serverPort = Number.parseInt(this.nestConfigService.get('PORT') || '3003')
		const serverHost = this.nestConfigService.get('HOST') || '0.0.0.0'
		const corsOrigin = this.nestConfigService.get('CORS_ORIGIN') || '*'
		const corsMethods = this.nestConfigService.get('CORS_METHODS') || 'GET'
		const corsMaxAge = Number.parseInt(this.nestConfigService.get('CORS_MAX_AGE') || '86400')

		// Cache configuration
		const memoryMaxSize = Number.parseInt(this.nestConfigService.get('CACHE_MEMORY_MAX_SIZE') || '104857600')
		const memoryDefaultTtl = Number.parseInt(this.nestConfigService.get('CACHE_MEMORY_DEFAULT_TTL') || '3600')
		const memoryCheckPeriod = Number.parseInt(this.nestConfigService.get('CACHE_MEMORY_CHECK_PERIOD') || '600')
		const memoryMaxKeys = Number.parseInt(this.nestConfigService.get('CACHE_MEMORY_MAX_KEYS') || '1000')
		const memoryWarningThreshold = Number.parseInt(this.nestConfigService.get('CACHE_MEMORY_WARNING_THRESHOLD') || '80')

		const redisHost = this.nestConfigService.get('REDIS_HOST') || 'localhost'
		const redisPort = Number.parseInt(this.nestConfigService.get('REDIS_PORT') || '6379')
		const redisPassword = this.nestConfigService.get('REDIS_PASSWORD')
		const redisDb = Number.parseInt(this.nestConfigService.get('REDIS_DB') || '0')
		const redisTtl = Number.parseInt(this.nestConfigService.get('REDIS_TTL') || '7200')
		const redisMaxRetries = Number.parseInt(this.nestConfigService.get('REDIS_MAX_RETRIES') || '3')
		const redisRetryDelay = Number.parseInt(this.nestConfigService.get('REDIS_RETRY_DELAY') || '100')

		const fileDirectory = this.nestConfigService.get('CACHE_FILE_DIRECTORY') || './storage'
		const fileMaxSize = Number.parseInt(this.nestConfigService.get('CACHE_FILE_MAX_SIZE') || '1073741824')
		const fileCleanupInterval = Number.parseInt(this.nestConfigService.get('CACHE_FILE_CLEANUP_INTERVAL') || '3600')

		// Cache warming configuration
		const warmingEnabledStr = this.nestConfigService.get('CACHE_WARMING_ENABLED') || 'true'
		const warmingEnabled = typeof warmingEnabledStr === 'string'
			? warmingEnabledStr.toLowerCase() === 'true'
			: warmingEnabledStr
		const warmingOnStartStr = this.nestConfigService.get('CACHE_WARMING_ON_START') || 'true'
		const warmingOnStart = typeof warmingOnStartStr === 'string'
			? warmingOnStartStr.toLowerCase() === 'true'
			: warmingOnStartStr
		const warmingMaxFiles = Number.parseInt(this.nestConfigService.get('CACHE_WARMING_MAX_FILES') || '50')
		const warmingCron = this.nestConfigService.get('CACHE_WARMING_CRON') || '0 */6 * * *'
		const warmingThreshold = Number.parseInt(this.nestConfigService.get('CACHE_WARMING_THRESHOLD') || '5')

		// Processing configuration
		const processingMaxConcurrent = Number.parseInt(this.nestConfigService.get('PROCESSING_MAX_CONCURRENT') || '10')
		const processingTimeout = Number.parseInt(this.nestConfigService.get('PROCESSING_TIMEOUT') || '30000')
		const processingRetries = Number.parseInt(this.nestConfigService.get('PROCESSING_RETRIES') || '3')
		const processingMaxFileSize = Number.parseInt(this.nestConfigService.get('PROCESSING_MAX_FILE_SIZE') || '10485760')

		const allowedFormatsStr = this.nestConfigService.get('PROCESSING_ALLOWED_FORMATS') || 'jpg,jpeg,png,webp,gif,svg'
		const allowedFormats = typeof allowedFormatsStr === 'string'
			? allowedFormatsStr.split(',').map(format => format.trim().toLowerCase())
			: allowedFormatsStr

		// Monitoring configuration
		const monitoringEnabledStr = this.nestConfigService.get('MONITORING_ENABLED') || 'true'
		const monitoringEnabled = typeof monitoringEnabledStr === 'string'
			? monitoringEnabledStr.toLowerCase() === 'true'
			: monitoringEnabledStr
		const monitoringMetricsPort = Number.parseInt(this.nestConfigService.get('MONITORING_METRICS_PORT') || '9090')
		const monitoringHealthPath = this.nestConfigService.get('MONITORING_HEALTH_PATH') || '/health'
		const monitoringMetricsPath = this.nestConfigService.get('MONITORING_METRICS_PATH') || '/metrics'

		// External services configuration
		const djangoUrl = this.nestConfigService.get('NEST_PUBLIC_DJANGO_URL') || 'http://localhost:8000'
		const nuxtUrl = this.nestConfigService.get('NEST_PUBLIC_NUXT_URL') || 'http://localhost:3000'
		const externalRequestTimeout = Number.parseInt(this.nestConfigService.get('EXTERNAL_REQUEST_TIMEOUT') || '30000')
		const externalMaxRetries = Number.parseInt(this.nestConfigService.get('EXTERNAL_MAX_RETRIES') || '3')

		return {
			server: {
				port: serverPort,
				host: serverHost,
				cors: {
					origin: corsOrigin,
					methods: corsMethods,
					maxAge: corsMaxAge,
				},
			},
			cache: {
				memory: {
					maxSize: memoryMaxSize,
					defaultTtl: memoryDefaultTtl,
					checkPeriod: memoryCheckPeriod,
					maxKeys: memoryMaxKeys,
					warningThreshold: memoryWarningThreshold,
				},
				redis: {
					host: redisHost,
					port: redisPort,
					password: redisPassword,
					db: redisDb,
					ttl: redisTtl,
					maxRetries: redisMaxRetries,
					retryDelayOnFailover: redisRetryDelay,
				},
				file: {
					directory: fileDirectory,
					maxSize: fileMaxSize,
					cleanupInterval: fileCleanupInterval,
				},
				warming: {
					enabled: warmingEnabled,
					warmupOnStart: warmingOnStart,
					maxFilesToWarm: warmingMaxFiles,
					warmupCron: warmingCron,
					popularImageThreshold: warmingThreshold,
				},
			},
			processing: {
				maxConcurrent: processingMaxConcurrent,
				timeout: processingTimeout,
				retries: processingRetries,
				maxFileSize: processingMaxFileSize,
				allowedFormats,
			},
			monitoring: {
				enabled: monitoringEnabled,
				metricsPort: monitoringMetricsPort,
				healthPath: monitoringHealthPath,
				metricsPath: monitoringMetricsPath,
			},
			externalServices: {
				djangoUrl,
				nuxtUrl,
				requestTimeout: externalRequestTimeout,
				maxRetries: externalMaxRetries,
			},
		}
	}

	private updateHotReloadableSettings(newConfig: AppConfig): void {
		// Update monitoring settings
		if (this.isHotReloadable('MONITORING_ENABLED')) {
			this.config.monitoring.enabled = newConfig.monitoring.enabled
		}

		// Update processing settings
		if (this.isHotReloadable('PROCESSING_MAX_CONCURRENT')) {
			this.config.processing.maxConcurrent = newConfig.processing.maxConcurrent
		}

		// Update cache settings
		if (this.isHotReloadable('CACHE_MEMORY_DEFAULT_TTL')) {
			this.config.cache.memory.defaultTtl = newConfig.cache.memory.defaultTtl
		}

		if (this.isHotReloadable('CACHE_FILE_CLEANUP_INTERVAL')) {
			this.config.cache.file.cleanupInterval = newConfig.cache.file.cleanupInterval
		}
	}
}
