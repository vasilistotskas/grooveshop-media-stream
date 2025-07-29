"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
            'CACHE_MEMORY_TTL',
            'CACHE_FILE_CLEANUP_INTERVAL',
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
        const { plainToClass } = await Promise.resolve().then(() => __importStar(require('class-transformer')));
        const { validate } = await Promise.resolve().then(() => __importStar(require('class-validator')));
        const { AppConfigDto } = await Promise.resolve().then(() => __importStar(require('@microservice/Config/dto/app-config.dto')));
        const rawConfig = this.createRawConfigForValidation();
        const dto = plainToClass(AppConfigDto, rawConfig, {
            enableImplicitConversion: true,
            excludeExtraneousValues: false,
        });
        const errors = await validate(dto, {
            whitelist: false,
            forbidNonWhitelisted: false,
        });
        if (errors.length > 0) {
            const errorMessages = errors.map(error => Object.values(error.constraints || {}).join(', ')).join('; ');
            throw new Error(`Configuration validation failed: ${errorMessages}`);
        }
        this.logger.log('Configuration validation passed');
    }
    createRawConfigForValidation() {
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
                djangoUrl: this.nestConfigService.get('NEST_PUBLIC_DJANGO_URL'),
                nuxtUrl: this.nestConfigService.get('NEST_PUBLIC_NUXT_URL'),
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
        };
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
        const warmingEnabled = typeof warmingEnabledStr === 'string'
            ? warmingEnabledStr.toLowerCase() === 'true'
            : warmingEnabledStr;
        const warmingOnStartStr = this.nestConfigService.get('CACHE_WARMING_ON_START') || 'true';
        const warmingOnStart = typeof warmingOnStartStr === 'string'
            ? warmingOnStartStr.toLowerCase() === 'true'
            : warmingOnStartStr;
        const warmingMaxFiles = Number.parseInt(this.nestConfigService.get('CACHE_WARMING_MAX_FILES') || '50');
        const warmingCron = this.nestConfigService.get('CACHE_WARMING_CRON') || '0 */6 * * *';
        const warmingThreshold = Number.parseInt(this.nestConfigService.get('CACHE_WARMING_THRESHOLD') || '5');
        const processingMaxConcurrent = Number.parseInt(this.nestConfigService.get('PROCESSING_MAX_CONCURRENT') || '10');
        const processingTimeout = Number.parseInt(this.nestConfigService.get('PROCESSING_TIMEOUT') || '30000');
        const processingRetries = Number.parseInt(this.nestConfigService.get('PROCESSING_RETRIES') || '3');
        const processingMaxFileSize = Number.parseInt(this.nestConfigService.get('PROCESSING_MAX_FILE_SIZE') || '10485760');
        const allowedFormatsStr = this.nestConfigService.get('PROCESSING_ALLOWED_FORMATS') || 'jpg,jpeg,png,webp,gif,svg';
        const allowedFormats = typeof allowedFormatsStr === 'string'
            ? allowedFormatsStr.split(',').map(format => format.trim().toLowerCase())
            : allowedFormatsStr;
        const monitoringEnabledStr = this.nestConfigService.get('MONITORING_ENABLED') || 'true';
        const monitoringEnabled = typeof monitoringEnabledStr === 'string'
            ? monitoringEnabledStr.toLowerCase() === 'true'
            : monitoringEnabledStr;
        const monitoringMetricsPort = Number.parseInt(this.nestConfigService.get('MONITORING_METRICS_PORT') || '9090');
        const monitoringHealthPath = this.nestConfigService.get('MONITORING_HEALTH_PATH') || '/health';
        const monitoringMetricsPath = this.nestConfigService.get('MONITORING_METRICS_PATH') || '/metrics';
        const djangoUrl = this.nestConfigService.get('NEST_PUBLIC_DJANGO_URL') || 'http://localhost:8000';
        const nuxtUrl = this.nestConfigService.get('NEST_PUBLIC_NUXT_URL') || 'http://localhost:3000';
        const externalRequestTimeout = Number.parseInt(this.nestConfigService.get('EXTERNAL_REQUEST_TIMEOUT') || '30000');
        const externalMaxRetries = Number.parseInt(this.nestConfigService.get('EXTERNAL_MAX_RETRIES') || '3');
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
};
exports.ConfigService = ConfigService;
exports.ConfigService = ConfigService = ConfigService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ConfigService);
//# sourceMappingURL=config.service.js.map