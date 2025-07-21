"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ConfigService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let ConfigService = ConfigService_1 = class ConfigService {
    constructor(nestConfigService) {
        this.nestConfigService = nestConfigService;
        this.logger = new common_1.Logger(ConfigService_1.name);
        this.hotReloadableKeys = new Set([
            'MONITORING_ENABLED',
            'PROCESSING_MAX_CONCURRENT',
            'CACHE_MEMORY_DEFAULT_TTL',
            'CACHE_FILE_CLEANUP_INTERVAL'
        ]);
        this.config = this.loadAndValidateConfig();
    }
    async onModuleInit() {
        this.logger.log('Configuration loaded and validated successfully');
    }
    get(key) {
        const keys = key.split('.');
        let value = this.config;
        for (const k of keys) {
            value = value?.[k];
        }
        if (value === undefined) {
            throw new Error(`Configuration key '${key}' not found`);
        }
        return value;
    }
    getOptional(key, defaultValue) {
        try {
            return this.get(key);
        }
        catch {
            return defaultValue;
        }
    }
    getAll() {
        return { ...this.config };
    }
    async validate() {
        const config = this.config;
        if (!config.server.port || config.server.port < 1 || config.server.port > 65535) {
            throw new Error('Invalid server port configuration');
        }
        if (!config.server.host) {
            throw new Error('Invalid server host configuration');
        }
        if (!config.externalServices.djangoUrl || !config.externalServices.nuxtUrl) {
            throw new Error('Invalid external services configuration');
        }
        this.logger.log('Configuration validation passed');
    }
    async reload() {
        this.logger.log('Reloading hot-reloadable configuration...');
        const newConfig = this.loadConfig();
        this.updateHotReloadableSettings(newConfig);
        this.logger.log('Hot-reloadable configuration updated successfully');
    }
    isHotReloadable(key) {
        return this.hotReloadableKeys.has(key);
    }
    loadAndValidateConfig() {
        return this.loadConfig();
    }
    loadConfig() {
        const serverPort = parseInt(this.nestConfigService.get('PORT') || '3003');
        const serverHost = this.nestConfigService.get('HOST') || '0.0.0.0';
        const corsOrigin = this.nestConfigService.get('CORS_ORIGIN') || '*';
        const corsMethods = this.nestConfigService.get('CORS_METHODS') || 'GET';
        const corsMaxAge = parseInt(this.nestConfigService.get('CORS_MAX_AGE') || '86400');
        const memoryMaxSize = parseInt(this.nestConfigService.get('CACHE_MEMORY_MAX_SIZE') || '104857600');
        const memoryDefaultTtl = parseInt(this.nestConfigService.get('CACHE_MEMORY_DEFAULT_TTL') || '3600');
        const memoryCheckPeriod = parseInt(this.nestConfigService.get('CACHE_MEMORY_CHECK_PERIOD') || '600');
        const memoryMaxKeys = parseInt(this.nestConfigService.get('CACHE_MEMORY_MAX_KEYS') || '1000');
        const memoryWarningThreshold = parseInt(this.nestConfigService.get('CACHE_MEMORY_WARNING_THRESHOLD') || '80');
        const redisHost = this.nestConfigService.get('REDIS_HOST') || 'localhost';
        const redisPort = parseInt(this.nestConfigService.get('REDIS_PORT') || '6379');
        const redisPassword = this.nestConfigService.get('REDIS_PASSWORD');
        const redisDb = parseInt(this.nestConfigService.get('REDIS_DB') || '0');
        const redisTtl = parseInt(this.nestConfigService.get('REDIS_TTL') || '7200');
        const redisMaxRetries = parseInt(this.nestConfigService.get('REDIS_MAX_RETRIES') || '3');
        const redisRetryDelay = parseInt(this.nestConfigService.get('REDIS_RETRY_DELAY') || '100');
        const fileDirectory = this.nestConfigService.get('CACHE_FILE_DIRECTORY') || './storage';
        const fileMaxSize = parseInt(this.nestConfigService.get('CACHE_FILE_MAX_SIZE') || '1073741824');
        const fileCleanupInterval = parseInt(this.nestConfigService.get('CACHE_FILE_CLEANUP_INTERVAL') || '3600');
        const warmingEnabledStr = this.nestConfigService.get('CACHE_WARMING_ENABLED') || 'true';
        const warmingEnabled = typeof warmingEnabledStr === 'string'
            ? warmingEnabledStr.toLowerCase() === 'true'
            : warmingEnabledStr;
        const warmingOnStartStr = this.nestConfigService.get('CACHE_WARMING_ON_START') || 'true';
        const warmingOnStart = typeof warmingOnStartStr === 'string'
            ? warmingOnStartStr.toLowerCase() === 'true'
            : warmingOnStartStr;
        const warmingMaxFiles = parseInt(this.nestConfigService.get('CACHE_WARMING_MAX_FILES') || '50');
        const warmingCron = this.nestConfigService.get('CACHE_WARMING_CRON') || '0 */6 * * *';
        const warmingThreshold = parseInt(this.nestConfigService.get('CACHE_WARMING_THRESHOLD') || '5');
        const processingMaxConcurrent = parseInt(this.nestConfigService.get('PROCESSING_MAX_CONCURRENT') || '10');
        const processingTimeout = parseInt(this.nestConfigService.get('PROCESSING_TIMEOUT') || '30000');
        const processingRetries = parseInt(this.nestConfigService.get('PROCESSING_RETRIES') || '3');
        const processingMaxFileSize = parseInt(this.nestConfigService.get('PROCESSING_MAX_FILE_SIZE') || '10485760');
        const allowedFormatsStr = this.nestConfigService.get('PROCESSING_ALLOWED_FORMATS') || 'jpg,jpeg,png,webp,gif,svg';
        const allowedFormats = typeof allowedFormatsStr === 'string'
            ? allowedFormatsStr.split(',').map(format => format.trim().toLowerCase())
            : allowedFormatsStr;
        const monitoringEnabledStr = this.nestConfigService.get('MONITORING_ENABLED') || 'true';
        const monitoringEnabled = typeof monitoringEnabledStr === 'string'
            ? monitoringEnabledStr.toLowerCase() === 'true'
            : monitoringEnabledStr;
        const monitoringMetricsPort = parseInt(this.nestConfigService.get('MONITORING_METRICS_PORT') || '9090');
        const monitoringHealthPath = this.nestConfigService.get('MONITORING_HEALTH_PATH') || '/health';
        const monitoringMetricsPath = this.nestConfigService.get('MONITORING_METRICS_PATH') || '/metrics';
        const djangoUrl = this.nestConfigService.get('NEST_PUBLIC_DJANGO_URL') || 'http://localhost:8000';
        const nuxtUrl = this.nestConfigService.get('NEST_PUBLIC_NUXT_URL') || 'http://localhost:3000';
        const externalRequestTimeout = parseInt(this.nestConfigService.get('EXTERNAL_REQUEST_TIMEOUT') || '30000');
        const externalMaxRetries = parseInt(this.nestConfigService.get('EXTERNAL_MAX_RETRIES') || '3');
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
                allowedFormats: allowedFormats
            },
            monitoring: {
                enabled: monitoringEnabled,
                metricsPort: monitoringMetricsPort,
                healthPath: monitoringHealthPath,
                metricsPath: monitoringMetricsPath
            },
            externalServices: {
                djangoUrl: djangoUrl,
                nuxtUrl: nuxtUrl,
                requestTimeout: externalRequestTimeout,
                maxRetries: externalMaxRetries
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
        if (this.isHotReloadable('CACHE_MEMORY_DEFAULT_TTL')) {
            this.config.cache.memory.defaultTtl = newConfig.cache.memory.defaultTtl;
        }
        if (this.isHotReloadable('CACHE_FILE_CLEANUP_INTERVAL')) {
            this.config.cache.file.cleanupInterval = newConfig.cache.file.cleanupInterval;
        }
    }
};
exports.ConfigService = ConfigService;
exports.ConfigService = ConfigService = ConfigService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ConfigService);
//# sourceMappingURL=config.service.js.map