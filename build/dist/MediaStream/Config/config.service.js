function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService as NestConfigService } from "@nestjs/config";
export class ConfigService {
    constructor(nestConfigService){
        this.nestConfigService = nestConfigService;
        this._logger = new Logger(ConfigService.name);
        this.hotReloadableKeys = new Set([
            'MONITORING_ENABLED',
            'PROCESSING_MAX_CONCURRENT',
            'CACHE_MEMORY_TTL',
            'CACHE_FILE_CLEANUP_INTERVAL'
        ]);
        this.config = this.loadAndValidateConfig();
    }
    async onModuleInit() {
        this._logger.log('Configuration loaded and validated successfully');
    }
    /**
	 * Get a configuration value by key with type safety
	 */ get(key) {
        const keys = key.split('.');
        let value = this.config;
        for (const k of keys){
            value = value?.[k];
        }
        if (value === undefined) {
            throw new Error(`Configuration key '${key}' not found`);
        }
        return value;
    }
    /**
	 * Get an optional configuration value with default fallback
	 */ getOptional(key, defaultValue) {
        try {
            return this.get(key);
        } catch  {
            return defaultValue;
        }
    }
    /**
	 * Get the entire configuration object
	 */ getAll() {
        return {
            ...this.config
        };
    }
    /**
	 * Validate the current configuration
	 */ async validate() {
        const { plainToClass } = await import("class-transformer");
        const { validate } = await import("class-validator");
        const { AppConfigDto } = await import("./dto/app-config.dto.js");
        const rawConfig = this.createRawConfigForValidation();
        const dto = plainToClass(AppConfigDto, rawConfig, {
            enableImplicitConversion: true,
            excludeExtraneousValues: false
        });
        const errors = await validate(dto, {
            whitelist: false,
            forbidNonWhitelisted: false
        });
        if (errors.length > 0) {
            const errorMessages = errors.map((error)=>Object.values(error.constraints || {}).join(', ')).join('; ');
            throw new Error(`Configuration validation failed: ${errorMessages}`);
        }
        this._logger.log('Configuration validation passed');
    }
    /**
	 * Create raw configuration object for validation
	 */ createRawConfigForValidation() {
        return {
            server: {
                port: this.nestConfigService.get('PORT'),
                host: this.nestConfigService.get('HOST'),
                cors: {
                    origin: this.nestConfigService.get('CORS_ORIGIN'),
                    methods: this.nestConfigService.get('CORS_METHODS'),
                    maxAge: this.nestConfigService.get('CORS_MAX_AGE')
                }
            },
            cache: {
                memory: {
                    maxSize: this.nestConfigService.get('CACHE_MEMORY_MAX_SIZE'),
                    defaultTtl: this.nestConfigService.get('CACHE_MEMORY_DEFAULT_TTL'),
                    checkPeriod: this.nestConfigService.get('CACHE_MEMORY_CHECK_PERIOD'),
                    maxKeys: this.nestConfigService.get('CACHE_MEMORY_MAX_KEYS'),
                    warningThreshold: this.nestConfigService.get('CACHE_MEMORY_WARNING_THRESHOLD')
                },
                redis: {
                    host: this.nestConfigService.get('REDIS_HOST'),
                    port: this.nestConfigService.get('REDIS_PORT'),
                    password: this.nestConfigService.get('REDIS_PASSWORD'),
                    db: this.nestConfigService.get('REDIS_DB'),
                    ttl: this.nestConfigService.get('REDIS_TTL'),
                    maxRetries: this.nestConfigService.get('REDIS_MAX_RETRIES'),
                    retryDelayOnFailover: this.nestConfigService.get('REDIS_RETRY_DELAY')
                },
                file: {
                    directory: this.nestConfigService.get('CACHE_FILE_DIRECTORY'),
                    maxSize: this.nestConfigService.get('CACHE_FILE_MAX_SIZE'),
                    cleanupInterval: this.nestConfigService.get('CACHE_FILE_CLEANUP_INTERVAL')
                },
                warming: {
                    enabled: this.nestConfigService.get('CACHE_WARMING_ENABLED'),
                    warmupOnStart: this.nestConfigService.get('CACHE_WARMING_ON_START'),
                    maxFilesToWarm: this.nestConfigService.get('CACHE_WARMING_MAX_FILES'),
                    warmupCron: this.nestConfigService.get('CACHE_WARMING_CRON'),
                    popularImageThreshold: this.nestConfigService.get('CACHE_WARMING_THRESHOLD')
                }
            },
            processing: {
                maxConcurrent: this.nestConfigService.get('PROCESSING_MAX_CONCURRENT'),
                timeout: this.nestConfigService.get('PROCESSING_TIMEOUT'),
                retries: this.nestConfigService.get('PROCESSING_RETRIES'),
                maxFileSize: this.nestConfigService.get('PROCESSING_MAX_FILE_SIZE'),
                allowedFormats: this.nestConfigService.get('PROCESSING_ALLOWED_FORMATS')
            },
            monitoring: {
                enabled: this.nestConfigService.get('MONITORING_ENABLED'),
                metricsPort: this.nestConfigService.get('MONITORING_METRICS_PORT'),
                healthPath: this.nestConfigService.get('MONITORING_HEALTH_PATH'),
                metricsPath: this.nestConfigService.get('MONITORING_METRICS_PATH')
            },
            externalServices: {
                djangoUrl: this.nestConfigService.get('NEST_PUBLIC_DJANGO_URL'),
                nuxtUrl: this.nestConfigService.get('NEST_PUBLIC_NUXT_URL'),
                requestTimeout: this.nestConfigService.get('EXTERNAL_REQUEST_TIMEOUT'),
                maxRetries: this.nestConfigService.get('EXTERNAL_MAX_RETRIES')
            },
            http: {
                timeout: this.nestConfigService.get('HTTP_TIMEOUT'),
                maxRetries: this.nestConfigService.get('HTTP_MAX_RETRIES'),
                retryDelay: this.nestConfigService.get('HTTP_RETRY_DELAY'),
                circuitBreaker: {
                    enabled: this.nestConfigService.get('HTTP_CIRCUIT_BREAKER_ENABLED'),
                    failureThreshold: this.nestConfigService.get('HTTP_CIRCUIT_BREAKER_FAILURE_THRESHOLD'),
                    resetTimeout: this.nestConfigService.get('HTTP_CIRCUIT_BREAKER_RESET_TIMEOUT')
                },
                healthCheck: {
                    enabled: this.nestConfigService.get('HTTP_HEALTH_CHECK_ENABLED'),
                    urls: this.nestConfigService.get('HTTP_HEALTH_CHECK_URLS'),
                    timeout: this.nestConfigService.get('HTTP_HEALTH_CHECK_TIMEOUT')
                }
            },
            rateLimit: {
                enabled: this.nestConfigService.get('RATE_LIMIT_ENABLED'),
                default: {
                    windowMs: this.nestConfigService.get('RATE_LIMIT_DEFAULT_WINDOW_MS'),
                    max: this.nestConfigService.get('RATE_LIMIT_DEFAULT_MAX')
                },
                imageProcessing: {
                    windowMs: this.nestConfigService.get('RATE_LIMIT_IMAGE_PROCESSING_WINDOW_MS'),
                    max: this.nestConfigService.get('RATE_LIMIT_IMAGE_PROCESSING_MAX')
                },
                healthCheck: {
                    windowMs: this.nestConfigService.get('RATE_LIMIT_HEALTH_CHECK_WINDOW_MS'),
                    max: this.nestConfigService.get('RATE_LIMIT_HEALTH_CHECK_MAX')
                },
                bypass: {
                    healthChecks: this.nestConfigService.get('RATE_LIMIT_BYPASS_HEALTH_CHECKS'),
                    metricsEndpoint: this.nestConfigService.get('RATE_LIMIT_BYPASS_METRICS_ENDPOINT'),
                    staticAssets: this.nestConfigService.get('RATE_LIMIT_BYPASS_STATIC_ASSETS'),
                    whitelistedDomains: this.nestConfigService.get('RATE_LIMIT_BYPASS_WHITELISTED_DOMAINS'),
                    bots: this.nestConfigService.get('RATE_LIMIT_BYPASS_BOTS')
                }
            }
        };
    }
    /**
	 * Reload configuration for hot-reloadable settings
	 */ async reload() {
        this._logger.log('Reloading hot-reloadable configuration...');
        const newConfig = this.loadConfig();
        this.updateHotReloadableSettings(newConfig);
        this._logger.log('Hot-reloadable configuration updated successfully');
    }
    /**
	 * Check if a configuration key supports hot-reload
	 */ isHotReloadable(key) {
        return this.hotReloadableKeys.has(key);
    }
    loadAndValidateConfig() {
        return this.loadConfig();
    }
    loadConfig() {
        const serverPort = Number.parseInt(this.nestConfigService.get('PORT') || '3003');
        const serverHost = this.nestConfigService.get('HOST') || '0.0.0.0';
        const corsOrigin = this.nestConfigService.get('CORS_ORIGIN') || '*';
        const corsMethods = this.nestConfigService.get('CORS_METHODS') || 'GET';
        const corsMaxAge = Number.parseInt(this.nestConfigService.get('CORS_MAX_AGE') || '86400');
        const memoryMaxSize = Number.parseInt(this.nestConfigService.get('CACHE_MEMORY_MAX_SIZE') || '104857600');
        const memoryDefaultTtl = Number.parseInt(this.nestConfigService.get('CACHE_MEMORY_DEFAULT_TTL') || '3600');
        const memoryCheckPeriod = Number.parseInt(this.nestConfigService.get('CACHE_MEMORY_CHECK_PERIOD') || '600');
        const memoryMaxKeys = Number.parseInt(this.nestConfigService.get('CACHE_MEMORY_MAX_KEYS') || '1000');
        const memoryWarningThreshold = Number.parseInt(this.nestConfigService.get('CACHE_MEMORY_WARNING_THRESHOLD') || '80');
        const redisHost = this.nestConfigService.get('REDIS_HOST') || 'localhost';
        const redisPort = Number.parseInt(this.nestConfigService.get('REDIS_PORT') || '6379');
        const redisPassword = this.nestConfigService.get('REDIS_PASSWORD');
        const redisDb = Number.parseInt(this.nestConfigService.get('REDIS_DB') || '0');
        const redisTtl = Number.parseInt(this.nestConfigService.get('REDIS_TTL') || '7200');
        const redisMaxRetries = Number.parseInt(this.nestConfigService.get('REDIS_MAX_RETRIES') || '3');
        const redisRetryDelay = Number.parseInt(this.nestConfigService.get('REDIS_RETRY_DELAY') || '100');
        const fileDirectory = this.nestConfigService.get('CACHE_FILE_DIRECTORY') || './storage';
        const fileMaxSize = Number.parseInt(this.nestConfigService.get('CACHE_FILE_MAX_SIZE') || '1073741824');
        const fileCleanupInterval = Number.parseInt(this.nestConfigService.get('CACHE_FILE_CLEANUP_INTERVAL') || '3600');
        const warmingEnabledStr = this.nestConfigService.get('CACHE_WARMING_ENABLED') || 'true';
        const warmingEnabled = typeof warmingEnabledStr === 'string' ? warmingEnabledStr.toLowerCase() === 'true' : warmingEnabledStr;
        const warmingOnStartStr = this.nestConfigService.get('CACHE_WARMING_ON_START') || 'true';
        const warmingOnStart = typeof warmingOnStartStr === 'string' ? warmingOnStartStr.toLowerCase() === 'true' : warmingOnStartStr;
        const warmingMaxFiles = Number.parseInt(this.nestConfigService.get('CACHE_WARMING_MAX_FILES') || '50');
        const warmingCron = this.nestConfigService.get('CACHE_WARMING_CRON') || '0 */6 * * *';
        const warmingThreshold = Number.parseInt(this.nestConfigService.get('CACHE_WARMING_THRESHOLD') || '5');
        const processingMaxConcurrent = Number.parseInt(this.nestConfigService.get('PROCESSING_MAX_CONCURRENT') || '10');
        const processingTimeout = Number.parseInt(this.nestConfigService.get('PROCESSING_TIMEOUT') || '30000');
        const processingRetries = Number.parseInt(this.nestConfigService.get('PROCESSING_RETRIES') || '3');
        const processingMaxFileSize = Number.parseInt(this.nestConfigService.get('PROCESSING_MAX_FILE_SIZE') || '10485760');
        const allowedFormatsStr = this.nestConfigService.get('PROCESSING_ALLOWED_FORMATS') || 'jpg,jpeg,png,webp,gif,svg';
        const allowedFormats = typeof allowedFormatsStr === 'string' ? allowedFormatsStr.split(',').map((format)=>format.trim().toLowerCase()) : allowedFormatsStr;
        const monitoringEnabledStr = this.nestConfigService.get('MONITORING_ENABLED') || 'true';
        const monitoringEnabled = typeof monitoringEnabledStr === 'string' ? monitoringEnabledStr.toLowerCase() === 'true' : monitoringEnabledStr;
        const monitoringMetricsPort = Number.parseInt(this.nestConfigService.get('MONITORING_METRICS_PORT') || '9090');
        const monitoringHealthPath = this.nestConfigService.get('MONITORING_HEALTH_PATH') || '/health';
        const monitoringMetricsPath = this.nestConfigService.get('MONITORING_METRICS_PATH') || '/metrics';
        const djangoUrl = this.nestConfigService.get('NEST_PUBLIC_DJANGO_URL') || 'http://localhost:8000';
        const nuxtUrl = this.nestConfigService.get('NEST_PUBLIC_NUXT_URL') || 'http://localhost:3000';
        const externalRequestTimeout = Number.parseInt(this.nestConfigService.get('EXTERNAL_REQUEST_TIMEOUT') || '30000');
        const externalMaxRetries = Number.parseInt(this.nestConfigService.get('EXTERNAL_MAX_RETRIES') || '3');
        const rateLimitEnabledStr = this.nestConfigService.get('RATE_LIMIT_ENABLED') || 'true';
        const rateLimitEnabled = typeof rateLimitEnabledStr === 'string' ? rateLimitEnabledStr.toLowerCase() === 'true' : rateLimitEnabledStr;
        const rateLimitDefaultWindowMs = Number.parseInt(this.nestConfigService.get('RATE_LIMIT_DEFAULT_WINDOW_MS') || '60000');
        const rateLimitDefaultMax = Number.parseInt(this.nestConfigService.get('RATE_LIMIT_DEFAULT_MAX') || '100');
        const rateLimitImageProcessingWindowMs = Number.parseInt(this.nestConfigService.get('RATE_LIMIT_IMAGE_PROCESSING_WINDOW_MS') || '60000');
        const rateLimitImageProcessingMax = Number.parseInt(this.nestConfigService.get('RATE_LIMIT_IMAGE_PROCESSING_MAX') || '50');
        const rateLimitHealthCheckWindowMs = Number.parseInt(this.nestConfigService.get('RATE_LIMIT_HEALTH_CHECK_WINDOW_MS') || '10000');
        const rateLimitHealthCheckMax = Number.parseInt(this.nestConfigService.get('RATE_LIMIT_HEALTH_CHECK_MAX') || '1000');
        const rateLimitBypassHealthChecksStr = this.nestConfigService.get('RATE_LIMIT_BYPASS_HEALTH_CHECKS') || 'true';
        const rateLimitBypassHealthChecks = typeof rateLimitBypassHealthChecksStr === 'string' ? rateLimitBypassHealthChecksStr.toLowerCase() === 'true' : rateLimitBypassHealthChecksStr;
        const rateLimitBypassMetricsEndpointStr = this.nestConfigService.get('RATE_LIMIT_BYPASS_METRICS_ENDPOINT') || 'true';
        const rateLimitBypassMetricsEndpoint = typeof rateLimitBypassMetricsEndpointStr === 'string' ? rateLimitBypassMetricsEndpointStr.toLowerCase() === 'true' : rateLimitBypassMetricsEndpointStr;
        const rateLimitBypassStaticAssetsStr = this.nestConfigService.get('RATE_LIMIT_BYPASS_STATIC_ASSETS') || 'true';
        const rateLimitBypassStaticAssets = typeof rateLimitBypassStaticAssetsStr === 'string' ? rateLimitBypassStaticAssetsStr.toLowerCase() === 'true' : rateLimitBypassStaticAssetsStr;
        const rateLimitBypassWhitelistedDomains = this.nestConfigService.get('RATE_LIMIT_BYPASS_WHITELISTED_DOMAINS') || '';
        const rateLimitBypassBotsStr = this.nestConfigService.get('RATE_LIMIT_BYPASS_BOTS') || 'true';
        const rateLimitBypassBots = typeof rateLimitBypassBotsStr === 'string' ? rateLimitBypassBotsStr.toLowerCase() === 'true' : rateLimitBypassBotsStr;
        return {
            server: {
                port: serverPort,
                host: serverHost,
                cors: {
                    origin: corsOrigin,
                    methods: corsMethods,
                    maxAge: corsMaxAge
                }
            },
            cache: {
                memory: {
                    maxSize: memoryMaxSize,
                    defaultTtl: memoryDefaultTtl,
                    checkPeriod: memoryCheckPeriod,
                    maxKeys: memoryMaxKeys,
                    warningThreshold: memoryWarningThreshold
                },
                redis: {
                    host: redisHost,
                    port: redisPort,
                    password: redisPassword,
                    db: redisDb,
                    ttl: redisTtl,
                    maxRetries: redisMaxRetries,
                    retryDelayOnFailover: redisRetryDelay
                },
                file: {
                    directory: fileDirectory,
                    maxSize: fileMaxSize,
                    cleanupInterval: fileCleanupInterval
                },
                warming: {
                    enabled: warmingEnabled,
                    warmupOnStart: warmingOnStart,
                    maxFilesToWarm: warmingMaxFiles,
                    warmupCron: warmingCron,
                    popularImageThreshold: warmingThreshold
                }
            },
            processing: {
                maxConcurrent: processingMaxConcurrent,
                timeout: processingTimeout,
                retries: processingRetries,
                maxFileSize: processingMaxFileSize,
                allowedFormats
            },
            monitoring: {
                enabled: monitoringEnabled,
                metricsPort: monitoringMetricsPort,
                healthPath: monitoringHealthPath,
                metricsPath: monitoringMetricsPath
            },
            externalServices: {
                djangoUrl,
                nuxtUrl,
                requestTimeout: externalRequestTimeout,
                maxRetries: externalMaxRetries
            },
            rateLimit: {
                enabled: rateLimitEnabled,
                default: {
                    windowMs: rateLimitDefaultWindowMs,
                    max: rateLimitDefaultMax
                },
                imageProcessing: {
                    windowMs: rateLimitImageProcessingWindowMs,
                    max: rateLimitImageProcessingMax
                },
                healthCheck: {
                    windowMs: rateLimitHealthCheckWindowMs,
                    max: rateLimitHealthCheckMax
                },
                bypass: {
                    healthChecks: rateLimitBypassHealthChecks,
                    metricsEndpoint: rateLimitBypassMetricsEndpoint,
                    staticAssets: rateLimitBypassStaticAssets,
                    whitelistedDomains: rateLimitBypassWhitelistedDomains,
                    bots: rateLimitBypassBots
                }
            }
        };
    }
    updateHotReloadableSettings(newConfig) {
        if (this.isHotReloadable('MONITORING_ENABLED')) {
            this.config.monitoring.enabled = newConfig.monitoring.enabled;
        }
        if (this.isHotReloadable('PROCESSING_MAX_CONCURRENT')) {
            this.config.processing.maxConcurrent = newConfig.processing.maxConcurrent;
        }
        if (this.isHotReloadable('CACHE_MEMORY_TTL')) {
            this.config.cache.memory.defaultTtl = newConfig.cache.memory.defaultTtl;
        }
        if (this.isHotReloadable('CACHE_FILE_CLEANUP_INTERVAL')) {
            this.config.cache.file.cleanupInterval = newConfig.cache.file.cleanupInterval;
        }
    }
}
ConfigService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof NestConfigService === "undefined" ? Object : NestConfigService
    ])
], ConfigService);

//# sourceMappingURL=config.service.js.map