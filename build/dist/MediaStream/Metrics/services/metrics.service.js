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
var MetricsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsService = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../Config/config.service");
const promClient = __importStar(require("prom-client"));
let MetricsService = MetricsService_1 = class MetricsService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(MetricsService_1.name);
        this.register = new promClient.Registry();
        promClient.collectDefaultMetrics({
            register: this.register,
            prefix: 'mediastream_'
        });
        this.httpRequestsTotal = new promClient.Counter({
            name: 'mediastream_http_requests_total',
            help: 'Total number of HTTP requests',
            labelNames: ['method', 'route', 'status_code'],
            registers: [this.register]
        });
        this.httpRequestDuration = new promClient.Histogram({
            name: 'mediastream_http_request_duration_seconds',
            help: 'Duration of HTTP requests in seconds',
            labelNames: ['method', 'route', 'status_code'],
            buckets: [0.1, 0.5, 1, 2, 5, 10],
            registers: [this.register]
        });
        this.memoryUsage = new promClient.Gauge({
            name: 'mediastream_memory_usage_bytes',
            help: 'Memory usage in bytes',
            labelNames: ['type'],
            registers: [this.register]
        });
        this.diskSpaceUsage = new promClient.Gauge({
            name: 'mediastream_disk_space_usage_bytes',
            help: 'Disk space usage in bytes',
            labelNames: ['type', 'path'],
            registers: [this.register]
        });
        this.cacheHitRatio = new promClient.Gauge({
            name: 'mediastream_cache_hit_ratio',
            help: 'Cache hit ratio (0-1)',
            labelNames: ['cache_type'],
            registers: [this.register]
        });
        this.activeConnections = new promClient.Gauge({
            name: 'mediastream_active_connections',
            help: 'Number of active connections',
            labelNames: ['type'],
            registers: [this.register]
        });
        this.imageProcessingDuration = new promClient.Histogram({
            name: 'mediastream_image_processing_duration_seconds',
            help: 'Duration of image processing operations in seconds',
            labelNames: ['operation', 'format', 'status'],
            buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
            registers: [this.register]
        });
        this.imageProcessingTotal = new promClient.Counter({
            name: 'mediastream_image_processing_total',
            help: 'Total number of image processing operations',
            labelNames: ['operation', 'format', 'status'],
            registers: [this.register]
        });
        this.cacheOperationsTotal = new promClient.Counter({
            name: 'mediastream_cache_operations_total',
            help: 'Total number of cache operations',
            labelNames: ['operation', 'cache_type', 'status'],
            registers: [this.register]
        });
        this.errorTotal = new promClient.Counter({
            name: 'mediastream_errors_total',
            help: 'Total number of errors',
            labelNames: ['type', 'operation'],
            registers: [this.register]
        });
    }
    async onModuleInit() {
        if (this.configService.get('monitoring.enabled')) {
            this.logger.log('Metrics collection initialized');
            this.startPeriodicMetricsCollection();
        }
        else {
            this.logger.log('Metrics collection disabled');
        }
    }
    async getMetrics() {
        return this.register.metrics();
    }
    getRegistry() {
        return this.register;
    }
    recordHttpRequest(method, route, statusCode, duration) {
        this.httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
        this.httpRequestDuration.observe({ method, route, status_code: statusCode.toString() }, duration);
    }
    recordImageProcessing(operation, format, status, duration) {
        this.imageProcessingTotal.inc({ operation, format, status });
        this.imageProcessingDuration.observe({ operation, format, status }, duration);
    }
    recordCacheOperation(operation, cacheType, status) {
        this.cacheOperationsTotal.inc({ operation, cache_type: cacheType, status });
    }
    recordError(type, operation) {
        this.errorTotal.inc({ type, operation });
    }
    updateMemoryMetrics(memoryInfo) {
        this.memoryUsage.set({ type: 'rss' }, memoryInfo.rss);
        this.memoryUsage.set({ type: 'heap_total' }, memoryInfo.heapTotal);
        this.memoryUsage.set({ type: 'heap_used' }, memoryInfo.heapUsed);
        this.memoryUsage.set({ type: 'external' }, memoryInfo.external);
    }
    updateDiskSpaceMetrics(path, total, used, free) {
        this.diskSpaceUsage.set({ type: 'total', path }, total);
        this.diskSpaceUsage.set({ type: 'used', path }, used);
        this.diskSpaceUsage.set({ type: 'free', path }, free);
    }
    updateCacheHitRatio(cacheType, ratio) {
        this.cacheHitRatio.set({ cache_type: cacheType }, ratio);
    }
    updateActiveConnections(type, count) {
        this.activeConnections.set({ type }, count);
    }
    reset() {
        this.register.resetMetrics();
    }
    startPeriodicMetricsCollection() {
        setInterval(() => {
            this.collectSystemMetrics();
        }, 30000);
        this.logger.log('Started periodic metrics collection');
    }
    collectSystemMetrics() {
        try {
            const memoryUsage = process.memoryUsage();
            this.updateMemoryMetrics({
                rss: memoryUsage.rss,
                heapTotal: memoryUsage.heapTotal,
                heapUsed: memoryUsage.heapUsed,
                external: memoryUsage.external
            });
            this.logger.debug('System metrics collected');
        }
        catch (error) {
            this.logger.error('Failed to collect system metrics:', error);
            this.recordError('metrics_collection', 'system_metrics');
        }
    }
};
exports.MetricsService = MetricsService;
exports.MetricsService = MetricsService = MetricsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], MetricsService);
//# sourceMappingURL=metrics.service.js.map