import type { StringMap } from '#microservice/common/types/common.types'
import type { OnModuleInit } from '@nestjs/common'
import type { AppConfig } from './interfaces/app-config.interface.js'
import { APP_CONFIG_SCHEMA, buildConfigFromSchema } from '#microservice/common/utils/config-schema.util'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService as NestConfigService } from '@nestjs/config'

@Injectable()
export class ConfigService implements OnModuleInit {
	private readonly _logger = new Logger(ConfigService.name)
	private config: AppConfig
	private readonly hotReloadableKeys = new Set([
		'MONITORING_ENABLED',
		'PROCESSING_MAX_CONCURRENT',
		'CACHE_MEMORY_TTL',
		'CACHE_FILE_CLEANUP_INTERVAL',
	])

	constructor(private readonly nestConfigService: NestConfigService) {
		this.config = this.loadAndValidateConfig()
	}

	async onModuleInit(): Promise<void> {
		this._logger.log('Configuration loaded and validated successfully')
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

		// Ensure boolean values are properly typed
		return this.ensureProperType(value) as T
	}

	/**
	 * Get an optional configuration value with default fallback
	 */
	getOptional<T = any>(key: string, defaultValue?: T): T {
		try {
			const value = this.get<T>(key)
			// Ensure boolean values are properly typed
			return this.ensureProperType(value) as T
		}
		catch {
			return defaultValue as T
		}
	}

	/**
	 * Ensure configuration values are properly typed
	 * This is critical for boolean values which can be strings from environment variables
	 */
	private ensureProperType<T>(value: any): T {
		// If it's a string that looks like a boolean, convert it
		if (typeof value === 'string') {
			const lowerValue = value.toLowerCase()
			if (lowerValue === 'true') {
				return true as T
			}
			if (lowerValue === 'false') {
				return false as T
			}
		}
		return value as T
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
		const { plainToClass } = await import('class-transformer')
		const { validate } = await import('class-validator')
		const { AppConfigDto } = await import('#microservice/Config/dto/app-config.dto')

		const rawConfig = this.createRawConfigForValidation()

		const dto = plainToClass(AppConfigDto, rawConfig, {
			enableImplicitConversion: true,
			excludeExtraneousValues: false,
		})
		const errors = await validate(dto, {
			whitelist: false,
			forbidNonWhitelisted: false,
		})

		if (errors.length > 0) {
			const errorMessages = errors.map(error =>
				Object.values(error.constraints || {}).join(', '),
			).join('; ')
			throw new Error(`Configuration validation failed: ${errorMessages}`)
		}

		this._logger.log('Configuration validation passed')
	}

	/**
	 * Create raw configuration object for validation
	 */
	private createRawConfigForValidation(): StringMap {
		return {
			server: {
				port: this.nestConfigService.get('PORT'),
				host: this.nestConfigService.get('HOST'),
				cors: {
					origin: this.nestConfigService.get('CORS_ORIGIN'),
					methods: this.nestConfigService.get('CORS_METHODS'),
					maxAge: this.nestConfigService.get('CORS_MAX_AGE'),
				},
			},
			cache: {
				memory: {
					maxSize: this.nestConfigService.get('CACHE_MEMORY_MAX_SIZE'),
					defaultTtl: this.nestConfigService.get('CACHE_MEMORY_DEFAULT_TTL'),
					checkPeriod: this.nestConfigService.get('CACHE_MEMORY_CHECK_PERIOD'),
					maxKeys: this.nestConfigService.get('CACHE_MEMORY_MAX_KEYS'),
					warningThreshold: this.nestConfigService.get('CACHE_MEMORY_WARNING_THRESHOLD'),
				},
				redis: {
					host: this.nestConfigService.get('REDIS_HOST'),
					port: this.nestConfigService.get('REDIS_PORT'),
					password: this.nestConfigService.get('REDIS_PASSWORD'),
					db: this.nestConfigService.get('REDIS_DB'),
					ttl: this.nestConfigService.get('REDIS_TTL'),
					maxRetries: this.nestConfigService.get('REDIS_MAX_RETRIES'),
					retryDelayOnFailover: this.nestConfigService.get('REDIS_RETRY_DELAY'),
				},
				file: {
					directory: this.nestConfigService.get('CACHE_FILE_DIRECTORY'),
					maxSize: this.nestConfigService.get('CACHE_FILE_MAX_SIZE'),
					cleanupInterval: this.nestConfigService.get('CACHE_FILE_CLEANUP_INTERVAL'),
				},
				warming: {
					enabled: this.nestConfigService.get('CACHE_WARMING_ENABLED'),
					warmupOnStart: this.nestConfigService.get('CACHE_WARMING_ON_START'),
					maxFilesToWarm: this.nestConfigService.get('CACHE_WARMING_MAX_FILES'),
					warmupCron: this.nestConfigService.get('CACHE_WARMING_CRON'),
					popularImageThreshold: this.nestConfigService.get('CACHE_WARMING_THRESHOLD'),
				},
			},
			processing: {
				maxConcurrent: this.nestConfigService.get('PROCESSING_MAX_CONCURRENT'),
				timeout: this.nestConfigService.get('PROCESSING_TIMEOUT'),
				retries: this.nestConfigService.get('PROCESSING_RETRIES'),
				maxFileSize: this.nestConfigService.get('PROCESSING_MAX_FILE_SIZE'),
				allowedFormats: this.nestConfigService.get('PROCESSING_ALLOWED_FORMATS'),
			},
			monitoring: {
				enabled: this.nestConfigService.get('MONITORING_ENABLED'),
				metricsPort: this.nestConfigService.get('MONITORING_METRICS_PORT'),
				healthPath: this.nestConfigService.get('MONITORING_HEALTH_PATH'),
				metricsPath: this.nestConfigService.get('MONITORING_METRICS_PATH'),
			},
			externalServices: {
				requestTimeout: this.nestConfigService.get('EXTERNAL_REQUEST_TIMEOUT'),
				maxRetries: this.nestConfigService.get('EXTERNAL_MAX_RETRIES'),
			},
			http: {
				timeout: this.nestConfigService.get('HTTP_TIMEOUT'),
				maxRetries: this.nestConfigService.get('HTTP_MAX_RETRIES'),
				retryDelay: this.nestConfigService.get('HTTP_RETRY_DELAY'),
				circuitBreaker: {
					enabled: this.nestConfigService.get('HTTP_CIRCUIT_BREAKER_ENABLED'),
					failureThreshold: this.nestConfigService.get('HTTP_CIRCUIT_BREAKER_FAILURE_THRESHOLD'),
					resetTimeout: this.nestConfigService.get('HTTP_CIRCUIT_BREAKER_RESET_TIMEOUT'),
				},
				healthCheck: {
					enabled: this.nestConfigService.get('HTTP_HEALTH_CHECK_ENABLED'),
					urls: this.nestConfigService.get('HTTP_HEALTH_CHECK_URLS'),
					timeout: this.nestConfigService.get('HTTP_HEALTH_CHECK_TIMEOUT'),
				},
			},
			rateLimit: {
				enabled: this.nestConfigService.get('RATE_LIMIT_ENABLED'),
				default: {
					windowMs: this.nestConfigService.get('RATE_LIMIT_DEFAULT_WINDOW_MS'),
					max: this.nestConfigService.get('RATE_LIMIT_DEFAULT_MAX'),
				},
				imageProcessing: {
					windowMs: this.nestConfigService.get('RATE_LIMIT_IMAGE_PROCESSING_WINDOW_MS'),
					max: this.nestConfigService.get('RATE_LIMIT_IMAGE_PROCESSING_MAX'),
				},
				healthCheck: {
					windowMs: this.nestConfigService.get('RATE_LIMIT_HEALTH_CHECK_WINDOW_MS'),
					max: this.nestConfigService.get('RATE_LIMIT_HEALTH_CHECK_MAX'),
				},
				bypass: {
					healthChecks: this.nestConfigService.get('RATE_LIMIT_BYPASS_HEALTH_CHECKS'),
					metricsEndpoint: this.nestConfigService.get('RATE_LIMIT_BYPASS_METRICS_ENDPOINT'),
					staticAssets: this.nestConfigService.get('RATE_LIMIT_BYPASS_STATIC_ASSETS'),
					whitelistedDomains: this.nestConfigService.get('RATE_LIMIT_BYPASS_WHITELISTED_DOMAINS'),
					bots: this.nestConfigService.get('RATE_LIMIT_BYPASS_BOTS'),
				},
			},
		}
	}

	/**
	 * Reload configuration for hot-reloadable settings
	 */
	async reload(): Promise<void> {
		this._logger.log('Reloading hot-reloadable configuration...')

		const newConfig = this.loadConfig()

		this.updateHotReloadableSettings(newConfig)

		this._logger.log('Hot-reloadable configuration updated successfully')
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

	/**
	 * Load configuration using schema-based approach
	 * This reduces repetitive parsing logic significantly
	 */
	private loadConfig(): AppConfig {
		// Use schema-based config loading for cleaner code
		const config = buildConfigFromSchema<AppConfig>(
			(key: string) => this.nestConfigService.get(key),
			APP_CONFIG_SCHEMA,
		)

		// Ensure nested objects exist (schema might not create all levels)
		return this.ensureConfigStructure(config)
	}

	/**
	 * Ensure all required nested config structures exist
	 */
	private ensureConfigStructure(config: any): AppConfig {
		return {
			server: {
				port: config.server?.port ?? 3003,
				host: config.server?.host ?? '0.0.0.0',
				cors: {
					origin: config.server?.cors?.origin ?? '*',
					methods: config.server?.cors?.methods ?? 'GET',
					maxAge: config.server?.cors?.maxAge ?? 86400,
				},
			},
			cache: {
				memory: {
					maxSize: config.cache?.memory?.maxSize ?? 104857600,
					defaultTtl: config.cache?.memory?.defaultTtl ?? 3600,
					checkPeriod: config.cache?.memory?.checkPeriod ?? 600,
					maxKeys: config.cache?.memory?.maxKeys ?? 1000,
					warningThreshold: config.cache?.memory?.warningThreshold ?? 80,
				},
				redis: {
					host: config.cache?.redis?.host ?? 'localhost',
					port: config.cache?.redis?.port ?? 6379,
					password: config.cache?.redis?.password,
					db: config.cache?.redis?.db ?? 0,
					ttl: config.cache?.redis?.ttl ?? 7200,
					maxRetries: config.cache?.redis?.maxRetries ?? 3,
					retryDelayOnFailover: config.cache?.redis?.retryDelayOnFailover ?? 100,
				},
				file: {
					directory: config.cache?.file?.directory ?? './storage',
					maxSize: config.cache?.file?.maxSize ?? 1073741824,
					cleanupInterval: config.cache?.file?.cleanupInterval ?? 3600,
				},
				warming: {
					enabled: config.cache?.warming?.enabled ?? true,
					warmupOnStart: config.cache?.warming?.warmupOnStart ?? true,
					maxFilesToWarm: config.cache?.warming?.maxFilesToWarm ?? 50,
					warmupCron: config.cache?.warming?.warmupCron ?? '0 */6 * * *',
					popularImageThreshold: config.cache?.warming?.popularImageThreshold ?? 5,
				},
				image: {
					publicTtl: config.cache?.image?.publicTtl ?? 12 * 30 * 24 * 60 * 60 * 1000,
					privateTtl: config.cache?.image?.privateTtl ?? 6 * 30 * 24 * 60 * 60 * 1000,
				},
			},
			processing: {
				maxConcurrent: config.processing?.maxConcurrent ?? 10,
				timeout: config.processing?.timeout ?? 30000,
				retries: config.processing?.retries ?? 3,
				maxFileSize: config.processing?.maxFileSize ?? 10485760,
				allowedFormats: config.processing?.allowedFormats ?? ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'],
			},
			monitoring: {
				enabled: config.monitoring?.enabled ?? true,
				metricsPort: config.monitoring?.metricsPort ?? 9090,
				healthPath: config.monitoring?.healthPath ?? '/health',
				metricsPath: config.monitoring?.metricsPath ?? '/metrics',
			},
			externalServices: {
				requestTimeout: config.externalServices?.requestTimeout ?? 30000,
				maxRetries: config.externalServices?.maxRetries ?? 3,
			},
			http: {
				timeout: config.http?.timeout ?? 30000,
				maxRetries: config.http?.maxRetries ?? 3,
				retryDelay: config.http?.retryDelay ?? 1000,
				circuitBreaker: {
					enabled: config.http?.circuitBreaker?.enabled ?? true,
					failureThreshold: config.http?.circuitBreaker?.failureThreshold ?? 50,
					resetTimeout: config.http?.circuitBreaker?.resetTimeout ?? 30000,
					monitoringPeriod: config.http?.circuitBreaker?.monitoringPeriod ?? 60000,
					minimumRequests: config.http?.circuitBreaker?.minimumRequests ?? 10,
				},
			},
			rateLimit: {
				enabled: config.rateLimit?.enabled ?? true,
				default: {
					windowMs: config.rateLimit?.default?.windowMs ?? 60000,
					max: config.rateLimit?.default?.max ?? 100,
				},
				imageProcessing: {
					windowMs: config.rateLimit?.imageProcessing?.windowMs ?? 60000,
					max: config.rateLimit?.imageProcessing?.max ?? 50,
				},
				healthCheck: {
					windowMs: config.rateLimit?.healthCheck?.windowMs ?? 10000,
					max: config.rateLimit?.healthCheck?.max ?? 1000,
				},
				bypass: {
					healthChecks: config.rateLimit?.bypass?.healthChecks ?? true,
					metricsEndpoint: config.rateLimit?.bypass?.metricsEndpoint ?? true,
					staticAssets: config.rateLimit?.bypass?.staticAssets ?? true,
					whitelistedDomains: config.rateLimit?.bypass?.whitelistedDomains ?? '',
					bots: config.rateLimit?.bypass?.bots ?? true,
				},
			},
			shutdown: {
				timeout: config.shutdown?.timeout ?? 30000,
				forceTimeout: config.shutdown?.forceTimeout ?? 60000,
			},
		}
	}

	private updateHotReloadableSettings(newConfig: AppConfig): void {
		if (this.isHotReloadable('MONITORING_ENABLED')) {
			this.config.monitoring.enabled = newConfig.monitoring.enabled
		}

		if (this.isHotReloadable('PROCESSING_MAX_CONCURRENT')) {
			this.config.processing.maxConcurrent = newConfig.processing.maxConcurrent
		}

		if (this.isHotReloadable('CACHE_MEMORY_TTL')) {
			this.config.cache.memory.defaultTtl = newConfig.cache.memory.defaultTtl
		}

		if (this.isHotReloadable('CACHE_FILE_CLEANUP_INTERVAL')) {
			this.config.cache.file.cleanupInterval = newConfig.cache.file.cleanupInterval
		}
	}
}
