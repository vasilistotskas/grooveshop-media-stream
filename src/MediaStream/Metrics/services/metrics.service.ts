import * as process from 'node:process'
import { ConfigService } from '@microservice/Config/config.service'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as promClient from 'prom-client'

@Injectable()
export class MetricsService implements OnModuleInit {
	private readonly logger = new Logger(MetricsService.name)
	private readonly register: promClient.Registry

	// System metrics
	private readonly httpRequestsTotal: promClient.Counter
	private readonly httpRequestDuration: promClient.Histogram
	private readonly memoryUsage: promClient.Gauge
	private readonly diskSpaceUsage: promClient.Gauge
	private readonly cacheHitRatio: promClient.Gauge
	private readonly activeConnections: promClient.Gauge

	// Application-specific metrics
	private readonly imageProcessingDuration: promClient.Histogram
	private readonly imageProcessingTotal: promClient.Counter
	private readonly cacheOperationsTotal: promClient.Counter
	private readonly errorTotal: promClient.Counter

	constructor(private readonly configService: ConfigService) {
		this.register = new promClient.Registry()

		// Add default metrics (CPU, memory, etc.)
		promClient.collectDefaultMetrics({
			register: this.register,
			prefix: 'mediastream_',
		})

		// HTTP metrics
		this.httpRequestsTotal = new promClient.Counter({
			name: 'mediastream_http_requests_total',
			help: 'Total number of HTTP requests',
			labelNames: ['method', 'route', 'status_code'],
			registers: [this.register],
		})

		this.httpRequestDuration = new promClient.Histogram({
			name: 'mediastream_http_request_duration_seconds',
			help: 'Duration of HTTP requests in seconds',
			labelNames: ['method', 'route', 'status_code'],
			buckets: [0.1, 0.5, 1, 2, 5, 10],
			registers: [this.register],
		})

		// System resource metrics
		this.memoryUsage = new promClient.Gauge({
			name: 'mediastream_memory_usage_bytes',
			help: 'Memory usage in bytes',
			labelNames: ['type'],
			registers: [this.register],
		})

		this.diskSpaceUsage = new promClient.Gauge({
			name: 'mediastream_disk_space_usage_bytes',
			help: 'Disk space usage in bytes',
			labelNames: ['type', 'path'],
			registers: [this.register],
		})

		this.cacheHitRatio = new promClient.Gauge({
			name: 'mediastream_cache_hit_ratio',
			help: 'Cache hit ratio (0-1)',
			labelNames: ['cache_type'],
			registers: [this.register],
		})

		this.activeConnections = new promClient.Gauge({
			name: 'mediastream_active_connections',
			help: 'Number of active connections',
			labelNames: ['type'],
			registers: [this.register],
		})

		// Application metrics
		this.imageProcessingDuration = new promClient.Histogram({
			name: 'mediastream_image_processing_duration_seconds',
			help: 'Duration of image processing operations in seconds',
			labelNames: ['operation', 'format', 'status'],
			buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
			registers: [this.register],
		})

		this.imageProcessingTotal = new promClient.Counter({
			name: 'mediastream_image_processing_total',
			help: 'Total number of image processing operations',
			labelNames: ['operation', 'format', 'status'],
			registers: [this.register],
		})

		this.cacheOperationsTotal = new promClient.Counter({
			name: 'mediastream_cache_operations_total',
			help: 'Total number of cache operations',
			labelNames: ['operation', 'cache_type', 'status'],
			registers: [this.register],
		})

		this.errorTotal = new promClient.Counter({
			name: 'mediastream_errors_total',
			help: 'Total number of errors',
			labelNames: ['type', 'operation'],
			registers: [this.register],
		})
	}

	async onModuleInit(): Promise<void> {
		if (this.configService.get('monitoring.enabled')) {
			this.logger.log('Metrics collection initialized')
			this.startPeriodicMetricsCollection()
		}
		else {
			this.logger.log('Metrics collection disabled')
		}
	}

	/**
	 * Get all metrics in Prometheus format
	 */
	async getMetrics(): Promise<string> {
		return this.register.metrics()
	}

	/**
	 * Get metrics registry for custom integrations
	 */
	getRegistry(): promClient.Registry {
		return this.register
	}

	/**
	 * Record HTTP request metrics
	 */
	recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
		this.httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() })
		this.httpRequestDuration.observe({ method, route, status_code: statusCode.toString() }, duration)
	}

	/**
	 * Record image processing metrics
	 */
	recordImageProcessing(operation: string, format: string, status: 'success' | 'error', duration: number): void {
		this.imageProcessingTotal.inc({ operation, format, status })
		this.imageProcessingDuration.observe({ operation, format, status }, duration)
	}

	/**
	 * Record cache operation metrics
	 */
	recordCacheOperation(operation: 'get' | 'set' | 'delete' | 'clear' | 'expire' | 'flush' | 'warmup', cacheType: string, status: 'hit' | 'miss' | 'success' | 'error'): void {
		this.cacheOperationsTotal.inc({ operation, cache_type: cacheType, status })
	}

	/**
	 * Record error metrics
	 */
	recordError(type: string, operation: string): void {
		this.errorTotal.inc({ type, operation })
	}

	/**
	 * Update memory usage metrics
	 */
	updateMemoryMetrics(memoryInfo: { rss: number, heapTotal: number, heapUsed: number, external: number }): void {
		this.memoryUsage.set({ type: 'rss' }, memoryInfo.rss)
		this.memoryUsage.set({ type: 'heap_total' }, memoryInfo.heapTotal)
		this.memoryUsage.set({ type: 'heap_used' }, memoryInfo.heapUsed)
		this.memoryUsage.set({ type: 'external' }, memoryInfo.external)
	}

	/**
	 * Update disk space metrics
	 */
	updateDiskSpaceMetrics(path: string, total: number, used: number, free: number): void {
		this.diskSpaceUsage.set({ type: 'total', path }, total)
		this.diskSpaceUsage.set({ type: 'used', path }, used)
		this.diskSpaceUsage.set({ type: 'free', path }, free)
	}

	/**
	 * Update cache hit ratio metrics
	 */
	updateCacheHitRatio(cacheType: string, ratio: number): void {
		this.cacheHitRatio.set({ cache_type: cacheType }, ratio)
	}

	/**
	 * Update active connections metrics
	 */
	updateActiveConnections(type: string, count: number): void {
		this.activeConnections.set({ type }, count)
	}

	/**
	 * Reset all metrics (useful for testing)
	 */
	reset(): void {
		this.register.resetMetrics()
	}

	private startPeriodicMetricsCollection(): void {
		// Collect system metrics every 30 seconds
		setInterval(() => {
			this.collectSystemMetrics()
		}, 30000)

		this.logger.log('Started periodic metrics collection')
	}

	private collectSystemMetrics(): void {
		try {
			// Collect memory metrics
			const memoryUsage = process.memoryUsage()
			this.updateMemoryMetrics({
				rss: memoryUsage.rss,
				heapTotal: memoryUsage.heapTotal,
				heapUsed: memoryUsage.heapUsed,
				external: memoryUsage.external,
			})

			this.logger.debug('System metrics collected')
		}
		catch (error) {
			this.logger.error('Failed to collect system metrics:', error)
			this.recordError('metrics_collection', 'system_metrics')
		}
	}
}
