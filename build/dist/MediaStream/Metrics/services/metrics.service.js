function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import * as fs from "node:fs";
import * as os from "node:os";
import * as process from "node:process";
import { ConfigService } from "../../Config/config.service.js";
import { Injectable, Logger } from "@nestjs/common";
import * as promClient from "prom-client";
export class MetricsService {
    async onModuleInit() {
        const isTestEnv = process.env.NODE_ENV === 'test';
        const monitoringEnabled = this._configService.get('monitoring.enabled');
        if (monitoringEnabled && !isTestEnv) {
            this._logger.log('Metrics collection initialized');
            this.startPeriodicMetricsCollection();
        } else {
            this._logger.log(`Metrics collection disabled${isTestEnv ? ' (test environment)' : ''}`);
        }
    }
    /**
	 * Get all metrics in Prometheus format
	 */ async getMetrics() {
        return this.register.metrics();
    }
    /**
	 * Get metrics registry for custom integrations
	 */ getRegistry() {
        return this.register;
    }
    /**
	 * Record HTTP request metrics
	 */ recordHttpRequest(method, route, statusCode, duration, requestSize, responseSize) {
        const statusCodeStr = statusCode.toString();
        this.httpRequestsTotal.inc({
            method,
            route,
            status_code: statusCodeStr
        });
        this.httpRequestDuration.observe({
            method,
            route,
            status_code: statusCodeStr
        }, duration);
        if (requestSize !== undefined) {
            this.httpRequestSize.observe({
                method,
                route
            }, requestSize);
        }
        if (responseSize !== undefined) {
            this.httpResponseSize.observe({
                method,
                route,
                status_code: statusCodeStr
            }, responseSize);
        }
    }
    /**
	 * Track requests in flight
	 */ incrementRequestsInFlight() {
        this.requestsInFlightCount++;
        this.requestsInFlight.set(this.requestsInFlightCount);
    }
    /**
	 * Decrement requests in flight
	 */ decrementRequestsInFlight() {
        this.requestsInFlightCount = Math.max(0, this.requestsInFlightCount - 1);
        this.requestsInFlight.set(this.requestsInFlightCount);
    }
    /**
	 * Record image processing metrics
	 */ recordImageProcessing(operation, format, status, duration) {
        this.imageProcessingTotal.inc({
            operation,
            format,
            status
        });
        this.imageProcessingDuration.observe({
            operation,
            format,
            status
        }, duration);
        if (status === 'error') {
            this.imageProcessingErrors.inc({
                operation,
                error_type: 'processing'
            });
        }
    }
    /**
	 * Update image processing queue size
	 */ updateImageProcessingQueueSize(size) {
        this.imageProcessingQueueSize.set(size);
    }
    /**
	 * Record image processing error
	 */ recordImageProcessingError(operation, errorType) {
        this.imageProcessingErrors.inc({
            operation,
            error_type: errorType
        });
    }
    /**
	 * Record cache operation metrics
	 */ recordCacheOperation(operation, cacheType, status, duration) {
        this.cacheOperationsTotal.inc({
            operation,
            cache_type: cacheType,
            status
        });
        if (duration !== undefined) {
            this.cacheOperationDuration.observe({
                operation,
                cache_type: cacheType,
                status
            }, duration);
        }
    }
    /**
	 * Record cache eviction
	 */ recordCacheEviction(cacheType, reason) {
        this.cacheEvictions.inc({
            cache_type: cacheType,
            reason
        });
    }
    /**
	 * Update cache size metrics
	 */ updateCacheSize(cacheType, sizeBytes) {
        this.cacheSize.set({
            cache_type: cacheType
        }, sizeBytes);
    }
    /**
	 * Record error metrics
	 */ recordError(type, operation) {
        this.errorTotal.inc({
            type,
            operation
        });
    }
    /**
	 * Update memory usage metrics
	 */ updateMemoryMetrics(memoryInfo) {
        this.memoryUsage.set({
            type: 'rss'
        }, memoryInfo.rss);
        this.memoryUsage.set({
            type: 'heap_total'
        }, memoryInfo.heapTotal);
        this.memoryUsage.set({
            type: 'heap_used'
        }, memoryInfo.heapUsed);
        this.memoryUsage.set({
            type: 'external'
        }, memoryInfo.external);
    }
    /**
	 * Update disk space metrics
	 */ updateDiskSpaceMetrics(path, total, used, free) {
        this.diskSpaceUsage.set({
            type: 'total',
            path
        }, total);
        this.diskSpaceUsage.set({
            type: 'used',
            path
        }, used);
        this.diskSpaceUsage.set({
            type: 'free',
            path
        }, free);
    }
    /**
	 * Update cache hit ratio metrics
	 */ updateCacheHitRatio(cacheType, ratio) {
        this.cacheHitRatio.set({
            cache_type: cacheType
        }, ratio);
    }
    /**
	 * Update active connections metrics
	 */ updateActiveConnections(type, count) {
        this.activeConnections.set({
            type
        }, count);
    }
    /**
	 * Update CPU usage metrics
	 */ updateCpuUsage(userPercent, systemPercent) {
        this.cpuUsage.set({
            type: 'user'
        }, userPercent);
        this.cpuUsage.set({
            type: 'system'
        }, systemPercent);
        this.cpuUsage.set({
            type: 'total'
        }, userPercent + systemPercent);
    }
    /**
	 * Update load average metrics
	 */ updateLoadAverage(load1, load5, load15) {
        this.loadAverage.set({
            period: '1m'
        }, load1);
        this.loadAverage.set({
            period: '5m'
        }, load5);
        this.loadAverage.set({
            period: '15m'
        }, load15);
    }
    /**
	 * Update file descriptor metrics
	 */ updateFileDescriptors(open, max) {
        this.fileDescriptors.set({
            type: 'open'
        }, open);
        this.fileDescriptors.set({
            type: 'max'
        }, max);
    }
    /**
	 * Update network connection metrics
	 */ updateNetworkConnections(established, listening, timeWait) {
        this.networkConnections.set({
            state: 'established'
        }, established);
        this.networkConnections.set({
            state: 'listening'
        }, listening);
        this.networkConnections.set({
            state: 'time_wait'
        }, timeWait);
    }
    /**
	 * Record garbage collection metrics
	 */ recordGarbageCollection(type, duration) {
        this.gcDuration.observe({
            type
        }, duration);
    }
    /**
	 * Record event loop lag
	 */ recordEventLoopLag(lag) {
        this.eventLoopLag.observe(lag);
    }
    /**
	 * Reset all metrics (useful for testing)
	 */ reset() {
        this.register.resetMetrics();
    }
    /**
	 * Stop all metric collection intervals (useful for testing and shutdown)
	 */ stopMetricsCollection() {
        if (this.systemMetricsInterval) {
            clearInterval(this.systemMetricsInterval);
            this.systemMetricsInterval = undefined;
        }
        if (this.performanceMetricsInterval) {
            clearInterval(this.performanceMetricsInterval);
            this.performanceMetricsInterval = undefined;
        }
        this._logger.log('Stopped periodic metrics collection');
    }
    startPeriodicMetricsCollection() {
        this.systemMetricsInterval = setInterval(()=>{
            this.collectSystemMetrics();
        }, 30000);
        this.performanceMetricsInterval = setInterval(()=>{
            this.collectPerformanceMetrics();
        }, 10000);
        this._logger.log('Started periodic metrics collection');
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
            const cpuUsage = process.cpuUsage();
            const totalCpuTime = cpuUsage.user + cpuUsage.system;
            const userPercent = totalCpuTime > 0 ? cpuUsage.user / totalCpuTime * 100 : 0;
            const systemPercent = totalCpuTime > 0 ? cpuUsage.system / totalCpuTime * 100 : 0;
            this.updateCpuUsage(userPercent, systemPercent);
            const loadAvg = os.loadavg();
            this.updateLoadAverage(loadAvg[0], loadAvg[1], loadAvg[2]);
            const uptimeSeconds = (Date.now() - this.startTime) / 1000;
            this.uptime.set(uptimeSeconds);
            this.collectDiskSpaceMetrics();
            this._logger.debug('System metrics collected');
        } catch (error) {
            this._logger.error('Failed to collect system metrics:', error);
            this.recordError('metrics_collection', 'system_metrics');
        }
    }
    collectPerformanceMetrics() {
        try {
            const start = process.hrtime.bigint();
            setImmediate(()=>{
                const lag = Number(process.hrtime.bigint() - start) / 1e9;
                this.recordEventLoopLag(lag);
            });
        } catch (error) {
            this._logger.error('Failed to collect performance metrics:', error);
            this.recordError('metrics_collection', 'performance_metrics');
        }
    }
    collectDiskSpaceMetrics() {
        try {
            const storagePaths = [
                './storage',
                './public',
                './build'
            ];
            for (const path of storagePaths){
                if (fs.existsSync(path)) {
                    const stats = fs.statSync(path);
                    if (stats.isDirectory()) {
                        const diskUsage = this.getDiskUsage(path);
                        if (diskUsage) {
                            this.updateDiskSpaceMetrics(path, diskUsage.total, diskUsage.used, diskUsage.free);
                        }
                    }
                }
            }
        } catch (error) {
            this._logger.error('Failed to collect disk space metrics:', error);
            this.recordError('metrics_collection', 'disk_space');
        }
    }
    getDiskUsage(path) {
        try {
            // In production, you'd use a library like 'node-disk-info' or 'statvfs'
            const size = this.getDirectorySize(path);
            return {
                total: size * 2,
                used: size,
                free: size
            };
        } catch  {
            return null;
        }
    }
    getDirectorySize(dirPath) {
        try {
            let totalSize = 0;
            const files = fs.readdirSync(dirPath);
            for (const file of files){
                const filePath = `${dirPath}/${file}`;
                const stats = fs.statSync(filePath);
                if (stats.isDirectory()) {
                    totalSize += this.getDirectorySize(filePath);
                } else {
                    totalSize += stats.size;
                }
            }
            return totalSize;
        } catch  {
            return 0;
        }
    }
    constructor(_configService){
        this._configService = _configService;
        this._logger = new Logger(MetricsService.name);
        this.startTime = Date.now();
        this.requestsInFlightCount = 0;
        this.register = new promClient.Registry();
        promClient.collectDefaultMetrics({
            register: this.register,
            prefix: 'mediastream_'
        });
        this.httpRequestsTotal = new promClient.Counter({
            name: 'mediastream_http_requests_total',
            help: 'Total number of HTTP requests',
            labelNames: [
                'method',
                'route',
                'status_code'
            ],
            registers: [
                this.register
            ]
        });
        this.httpRequestDuration = new promClient.Histogram({
            name: 'mediastream_http_request_duration_seconds',
            help: 'Duration of HTTP requests in seconds',
            labelNames: [
                'method',
                'route',
                'status_code'
            ],
            buckets: [
                0.001,
                0.005,
                0.01,
                0.05,
                0.1,
                0.5,
                1,
                2,
                5,
                10
            ],
            registers: [
                this.register
            ]
        });
        this.httpRequestSize = new promClient.Histogram({
            name: 'mediastream_http_request_size_bytes',
            help: 'Size of HTTP requests in bytes',
            labelNames: [
                'method',
                'route'
            ],
            buckets: [
                100,
                1000,
                10000,
                100000,
                1000000,
                10000000
            ],
            registers: [
                this.register
            ]
        });
        this.httpResponseSize = new promClient.Histogram({
            name: 'mediastream_http_response_size_bytes',
            help: 'Size of HTTP responses in bytes',
            labelNames: [
                'method',
                'route',
                'status_code'
            ],
            buckets: [
                100,
                1000,
                10000,
                100000,
                1000000,
                10000000
            ],
            registers: [
                this.register
            ]
        });
        this.memoryUsage = new promClient.Gauge({
            name: 'mediastream_memory_usage_bytes',
            help: 'Memory usage in bytes',
            labelNames: [
                'type'
            ],
            registers: [
                this.register
            ]
        });
        this.diskSpaceUsage = new promClient.Gauge({
            name: 'mediastream_disk_space_usage_bytes',
            help: 'Disk space usage in bytes',
            labelNames: [
                'type',
                'path'
            ],
            registers: [
                this.register
            ]
        });
        this.cpuUsage = new promClient.Gauge({
            name: 'mediastream_cpu_usage_percent',
            help: 'CPU usage percentage',
            labelNames: [
                'type'
            ],
            registers: [
                this.register
            ]
        });
        this.loadAverage = new promClient.Gauge({
            name: 'mediastream_load_average',
            help: 'System load average',
            labelNames: [
                'period'
            ],
            registers: [
                this.register
            ]
        });
        this.fileDescriptors = new promClient.Gauge({
            name: 'mediastream_file_descriptors',
            help: 'Number of open file descriptors',
            labelNames: [
                'type'
            ],
            registers: [
                this.register
            ]
        });
        this.networkConnections = new promClient.Gauge({
            name: 'mediastream_network_connections',
            help: 'Number of network connections',
            labelNames: [
                'state'
            ],
            registers: [
                this.register
            ]
        });
        this.activeConnections = new promClient.Gauge({
            name: 'mediastream_active_connections',
            help: 'Number of active connections',
            labelNames: [
                'type'
            ],
            registers: [
                this.register
            ]
        });
        this.requestsInFlight = new promClient.Gauge({
            name: 'mediastream_requests_in_flight',
            help: 'Number of requests currently being processed',
            registers: [
                this.register
            ]
        });
        this.uptime = new promClient.Gauge({
            name: 'mediastream_uptime_seconds',
            help: 'Application uptime in seconds',
            registers: [
                this.register
            ]
        });
        this.imageProcessingQueueSize = new promClient.Gauge({
            name: 'mediastream_image_processing_queue_size',
            help: 'Number of items in image processing queue',
            registers: [
                this.register
            ]
        });
        this.imageProcessingErrors = new promClient.Counter({
            name: 'mediastream_image_processing_errors_total',
            help: 'Total number of image processing errors',
            labelNames: [
                'operation',
                'error_type'
            ],
            registers: [
                this.register
            ]
        });
        this.gcDuration = new promClient.Histogram({
            name: 'mediastream_gc_duration_seconds',
            help: 'Garbage collection duration in seconds',
            labelNames: [
                'type'
            ],
            buckets: [
                0.001,
                0.01,
                0.1,
                1,
                10
            ],
            registers: [
                this.register
            ]
        });
        this.eventLoopLag = new promClient.Histogram({
            name: 'mediastream_event_loop_lag_seconds',
            help: 'Event loop lag in seconds',
            buckets: [
                0.001,
                0.01,
                0.1,
                1,
                10
            ],
            registers: [
                this.register
            ]
        });
        this.cacheHitRatio = new promClient.Gauge({
            name: 'mediastream_cache_hit_ratio',
            help: 'Cache hit ratio (0-1)',
            labelNames: [
                'cache_type'
            ],
            registers: [
                this.register
            ]
        });
        this.cacheSize = new promClient.Gauge({
            name: 'mediastream_cache_size_bytes',
            help: 'Cache size in bytes',
            labelNames: [
                'cache_type'
            ],
            registers: [
                this.register
            ]
        });
        this.cacheEvictions = new promClient.Counter({
            name: 'mediastream_cache_evictions_total',
            help: 'Total number of cache evictions',
            labelNames: [
                'cache_type',
                'reason'
            ],
            registers: [
                this.register
            ]
        });
        this.cacheOperationDuration = new promClient.Histogram({
            name: 'mediastream_cache_operation_duration_seconds',
            help: 'Duration of cache operations in seconds',
            labelNames: [
                'operation',
                'cache_type',
                'status'
            ],
            buckets: [
                0.001,
                0.005,
                0.01,
                0.05,
                0.1,
                0.5,
                1
            ],
            registers: [
                this.register
            ]
        });
        this.imageProcessingDuration = new promClient.Histogram({
            name: 'mediastream_image_processing_duration_seconds',
            help: 'Duration of image processing operations in seconds',
            labelNames: [
                'operation',
                'format',
                'status'
            ],
            buckets: [
                0.1,
                0.5,
                1,
                2,
                5,
                10,
                30
            ],
            registers: [
                this.register
            ]
        });
        this.imageProcessingTotal = new promClient.Counter({
            name: 'mediastream_image_processing_total',
            help: 'Total number of image processing operations',
            labelNames: [
                'operation',
                'format',
                'status'
            ],
            registers: [
                this.register
            ]
        });
        this.cacheOperationsTotal = new promClient.Counter({
            name: 'mediastream_cache_operations_total',
            help: 'Total number of cache operations',
            labelNames: [
                'operation',
                'cache_type',
                'status'
            ],
            registers: [
                this.register
            ]
        });
        this.errorTotal = new promClient.Counter({
            name: 'mediastream_errors_total',
            help: 'Total number of errors',
            labelNames: [
                'type',
                'operation'
            ],
            registers: [
                this.register
            ]
        });
    }
}
MetricsService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ConfigService === "undefined" ? Object : ConfigService
    ])
], MetricsService);

//# sourceMappingURL=metrics.service.js.map