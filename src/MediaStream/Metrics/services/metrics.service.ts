import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { SourceImageFormat } from '#microservice/common/constants/image-limits.constant'
import type { ImageRequestOutcome } from '#microservice/Correlation/utils/image-request-log.util'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as process from 'node:process'
import { Injectable, Logger } from '@nestjs/common'
import * as promClient from 'prom-client'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'

/** Every reason admission control sheds an image request for. */
export const PROCESSING_REJECT_REASONS = ['queue_full', 'queue_timeout'] as const
export type ProcessingRejectReason = (typeof PROCESSING_REJECT_REASONS)[number]

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
	private readonly _logger = new Logger(MetricsService.name)
	private readonly register: promClient.Registry

	private readonly httpRequestsTotal: promClient.Counter
	private readonly httpRequestDuration: promClient.Histogram
	private readonly httpRequestSize: promClient.Histogram
	private readonly httpResponseSize: promClient.Histogram

	private readonly memoryUsage: promClient.Gauge
	private readonly diskSpaceUsage: promClient.Gauge
	private readonly cpuUsage: promClient.Gauge
	private readonly loadAverage: promClient.Gauge

	private readonly cacheHitRatio: promClient.Gauge
	private readonly cacheOperationsTotal: promClient.Counter
	private readonly cacheOperationDuration: promClient.Histogram

	private readonly imageProcessingDuration: promClient.Histogram
	private readonly imageProcessingTotal: promClient.Counter
	private readonly imageProcessingErrors: promClient.Counter
	private readonly imageRequestsTotal: promClient.Counter
	private readonly imageRequestDuration: promClient.Histogram
	private readonly imageInputBytes: promClient.Histogram

	private readonly activeConnections: promClient.Gauge
	private readonly errorTotal: promClient.Counter
	private readonly requestsInFlight: promClient.Gauge
	private readonly uptime: promClient.Gauge

	private readonly rateLimitAttemptsTotal: promClient.Counter
	private readonly rateLimitBlockedTotal: promClient.Counter

	private readonly eventLoopLag: promClient.Histogram

	private readonly tenantDomainsCount: promClient.Gauge
	private readonly tenantDomainsLastRefreshTimestamp: promClient.Gauge

	private readonly processingPipelines: promClient.Gauge
	private readonly processingRejectedTotal: promClient.Counter

	private startTime: number = Date.now()
	private requestsInFlightCount: number = 0
	private systemMetricsInterval?: NodeJS.Timeout
	private performanceMetricsInterval?: NodeJS.Timeout
	private previousCpuUsage: { user: number, system: number } = { user: 0, system: 0 }
	private previousCpuTime: number = Date.now()

	private readonly systemMetricsIntervalMs: number
	private readonly performanceMetricsIntervalMs: number
	private readonly storagePath: string

	constructor(private readonly _configService: ConfigService) {
		this.register = new promClient.Registry()

		// Load monitoring configuration
		this.systemMetricsIntervalMs = this._configService.get('monitoring.systemMetricsInterval')
		this.performanceMetricsIntervalMs = this._configService.get('monitoring.performanceMetricsInterval')
		this.storagePath = storageDirectory(this._configService)

		promClient.collectDefaultMetrics({
			register: this.register,
			prefix: 'mediastream_',
		})

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
			buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
			registers: [this.register],
		})

		this.httpRequestSize = new promClient.Histogram({
			name: 'mediastream_http_request_size_bytes',
			help: 'Size of HTTP requests in bytes',
			labelNames: ['method', 'route'],
			buckets: [100, 1000, 10000, 100000, 1000000, 10000000],
			registers: [this.register],
		})

		this.httpResponseSize = new promClient.Histogram({
			name: 'mediastream_http_response_size_bytes',
			help: 'Size of HTTP responses in bytes',
			labelNames: ['method', 'route', 'status_code'],
			buckets: [100, 1000, 10000, 100000, 1000000, 10000000],
			registers: [this.register],
		})

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

		this.cpuUsage = new promClient.Gauge({
			name: 'mediastream_cpu_usage_percent',
			help: 'CPU usage percentage',
			labelNames: ['type'],
			registers: [this.register],
		})

		this.loadAverage = new promClient.Gauge({
			name: 'mediastream_load_average',
			help: 'System load average',
			labelNames: ['period'],
			registers: [this.register],
		})

		this.activeConnections = new promClient.Gauge({
			name: 'mediastream_active_connections',
			help: 'Number of active connections',
			labelNames: ['type'],
			registers: [this.register],
		})

		this.requestsInFlight = new promClient.Gauge({
			name: 'mediastream_requests_in_flight',
			help: 'Number of requests currently being processed',
			registers: [this.register],
		})

		this.uptime = new promClient.Gauge({
			name: 'mediastream_uptime_seconds',
			help: 'Application uptime in seconds',
			registers: [this.register],
		})

		this.imageProcessingErrors = new promClient.Counter({
			name: 'mediastream_image_processing_errors_total',
			help: 'Total number of image processing errors',
			labelNames: ['operation', 'error_type'],
			registers: [this.register],
		})

		// Image-route labels are closed sets: `outcome` (ImageRequestOutcome),
		// `format` (a SupportedResizeFormats value or "none" when the URL had
		// no valid one), `cache` (ImageCacheResult or "none" when the lookup
		// never ran). The tenant schema is deliberately not a label: any
		// string matching the schema pattern reaches this route, so it is
		// unbounded; it is a field of the per-request log line instead.
		this.imageRequestsTotal = new promClient.Counter({
			name: 'mediastream_image_requests_total',
			help: 'Completed image-route requests by outcome, requested output format and cache result',
			labelNames: ['outcome', 'format', 'cache'],
			registers: [this.register],
		})

		this.imageRequestDuration = new promClient.Histogram({
			name: 'mediastream_image_request_duration_seconds',
			help: 'Image-route request duration from the first middleware to the response closing, by outcome and cache result',
			labelNames: ['outcome', 'cache'],
			buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
			registers: [this.register],
		})

		this.imageInputBytes = new promClient.Histogram({
			name: 'mediastream_image_input_bytes',
			help: 'Size of each completed upstream download, by the format sniffed from its bytes',
			labelNames: ['format'],
			buckets: [16384, 65536, 262144, 524288, 1048576, 2097152, 4194304, 8388608, 10485760],
			registers: [this.register],
		})

		this.eventLoopLag = new promClient.Histogram({
			name: 'mediastream_event_loop_lag_seconds',
			help: 'Event loop lag in seconds',
			buckets: [0.001, 0.01, 0.1, 1, 10],
			registers: [this.register],
		})

		this.cacheHitRatio = new promClient.Gauge({
			name: 'mediastream_cache_hit_ratio',
			help: 'Cache hit ratio (0-1)',
			labelNames: ['cache_type'],
			registers: [this.register],
		})

		this.cacheOperationDuration = new promClient.Histogram({
			name: 'mediastream_cache_operation_duration_seconds',
			help: 'Duration of cache operations in seconds',
			labelNames: ['operation', 'cache_type', 'status'],
			buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
			registers: [this.register],
		})

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

		this.rateLimitAttemptsTotal = new promClient.Counter({
			name: 'mediastream_rate_limit_attempts_total',
			help: 'Total number of rate limit attempts',
			labelNames: ['request_type', 'status'],
			registers: [this.register],
		})

		this.rateLimitBlockedTotal = new promClient.Counter({
			name: 'mediastream_rate_limit_blocked_total',
			help: 'Total number of blocked requests due to rate limiting',
			labelNames: ['request_type'],
			registers: [this.register],
		})

		this.errorTotal = new promClient.Counter({
			name: 'mediastream_errors_total',
			help: 'Total number of errors',
			labelNames: ['type', 'operation'],
			registers: [this.register],
		})

		this.processingPipelines = new promClient.Gauge({
			name: 'mediastream_processing_pipelines',
			help: 'Sharp pipelines by admission state: in_flight (running) or queued (waiting for a slot)',
			labelNames: ['state'],
			registers: [this.register],
		})

		this.processingRejectedTotal = new promClient.Counter({
			name: 'mediastream_processing_rejected_total',
			help: 'Processing attempts rejected by admission control, by reason (one per shed pipeline; deduplicated waiters share a rejection)',
			labelNames: ['reason'],
			registers: [this.register],
		})

		this.tenantDomainsCount = new promClient.Gauge({
			name: 'mediastream_tenant_domains_count',
			help: 'Number of hostnames currently in the dynamic per-tenant domain allowlist (TenantDomainsService)',
			registers: [this.register],
		})

		this.tenantDomainsLastRefreshTimestamp = new promClient.Gauge({
			name: 'mediastream_tenant_domains_last_refresh_timestamp_seconds',
			help: 'Unix timestamp (seconds) of the last successful TenantDomainsService feed refresh, 0 if it has never succeeded',
			registers: [this.register],
		})

		// A labelled series does not exist until its first write, so without
		// this an idle pod exports no admission metrics at all and "nothing
		// shed" is indistinguishable from "not scraped". Both label sets are
		// closed, so every value is initialised to zero at boot (Prometheus
		// instrumentation guidance: avoid missing metrics).
		this.setProcessingAdmission(0, 0)
		for (const reason of PROCESSING_REJECT_REASONS) {
			this.processingRejectedTotal.inc({ reason }, 0)
		}
	}

	async onModuleInit(): Promise<void> {
		if (this._configService.get<boolean>('monitoring.enabled')) {
			this._logger.log('Metrics collection initialized')
			this.startPeriodicMetricsCollection()
		}
		else {
			this._logger.log('Metrics collection disabled')
		}
	}

	async onModuleDestroy(): Promise<void> {
		this.stopMetricsCollection()
		this._logger.log('Metrics service destroyed')
	}

	/**
	 * Get all metrics in Prometheus format
	 */
	async getMetrics(): Promise<string> {
		return this.register.metrics()
	}

	/**
	 * Record HTTP request metrics.
	 *
	 * @param method - HTTP method (GET, POST, etc.)
	 * @param route - Normalized route path
	 * @param statusCode - HTTP response status code
	 * @param duration - Request duration in seconds
	 * @param requestSize - Optional request body size in bytes
	 * @param responseSize - Optional response body size in bytes
	 */
	recordHttpRequest(method: string, route: string, statusCode: number, duration: number, requestSize?: number, responseSize?: number): void {
		const statusCodeStr = statusCode.toString()
		this.httpRequestsTotal.inc({ method, route, status_code: statusCodeStr })
		this.httpRequestDuration.observe({ method, route, status_code: statusCodeStr }, duration)

		if (requestSize !== undefined) {
			this.httpRequestSize.observe({ method, route }, requestSize)
		}

		if (responseSize !== undefined) {
			this.httpResponseSize.observe({ method, route, status_code: statusCodeStr }, responseSize)
		}
	}

	/**
	 * Track requests in flight
	 */
	incrementRequestsInFlight(): void {
		this.requestsInFlightCount++
		this.requestsInFlight.set(this.requestsInFlightCount)
	}

	/**
	 * Decrement requests in flight
	 */
	decrementRequestsInFlight(): void {
		this.requestsInFlightCount = Math.max(0, this.requestsInFlightCount - 1)
		this.requestsInFlight.set(this.requestsInFlightCount)
	}

	/**
	 * Record image processing metrics.
	 *
	 * @param operation - Processing operation name
	 * @param format - Image format (webp, jpeg, png, etc.)
	 * @param status - Operation result: 'success' or 'error'
	 * @param duration - Processing duration in seconds
	 */
	recordImageProcessing(operation: string, format: string, status: 'success' | 'error', duration: number): void {
		this.imageProcessingTotal.inc({ operation, format, status })
		this.imageProcessingDuration.observe({ operation, format, status }, duration)

		if (status === 'error') {
			this.imageProcessingErrors.inc({ operation, error_type: 'processing' })
		}
	}

	/**
	 * Record cache operation metrics.
	 *
	 * @param operation - Cache operation type
	 * @param cacheType - Cache layer name (memory, redis, multi-layer, etc.)
	 * @param status - Operation result: 'hit', 'miss', 'success', or 'error'
	 * @param duration - Optional operation duration in seconds
	 */
	recordCacheOperation(operation: 'get' | 'set' | 'delete' | 'clear' | 'expire' | 'flush' | 'warmup', cacheType: string, status: 'hit' | 'miss' | 'success' | 'error', duration?: number): void {
		this.cacheOperationsTotal.inc({ operation, cache_type: cacheType, status })

		if (duration !== undefined) {
			this.cacheOperationDuration.observe({ operation, cache_type: cacheType, status }, duration)
		}
	}

	/**
	 * Record error metrics
	 */
	recordError(type: string, operation: string): void {
		this.errorTotal.inc({ type, operation })
	}

	/** Current Sharp pipeline occupancy as seen by ProcessingAdmissionService. */
	setProcessingAdmission(inFlight: number, queued: number): void {
		this.processingPipelines.set({ state: 'in_flight' }, inFlight)
		this.processingPipelines.set({ state: 'queued' }, queued)
	}

	/** One image request shed by admission control (503). */
	recordProcessingRejected(reason: ProcessingRejectReason): void {
		this.processingRejectedTotal.inc({ reason })
	}

	/**
	 * Record a rate limit attempt
	 */
	recordRateLimitAttempt(requestType: string, allowed: boolean): void {
		const status = allowed ? 'allowed' : 'blocked'
		this.rateLimitAttemptsTotal.inc({ request_type: requestType, status })

		if (!allowed) {
			this.rateLimitBlockedTotal.inc({ request_type: requestType })
		}
	}

	/** One completed image-route request; label values are normalised by the caller (ImageRequestLogMiddleware). */
	recordImageRequest(outcome: ImageRequestOutcome, format: string, cache: string, durationSeconds: number): void {
		this.imageRequestsTotal.inc({ outcome, format, cache })
		this.imageRequestDuration.observe({ outcome, cache }, durationSeconds)
	}

	/** One completed upstream download, labelled by the format sniffed from its bytes. */
	recordImageInput(format: SourceImageFormat, bytes: number): void {
		this.imageInputBytes.observe({ format }, bytes)
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
	 * Update the dynamic tenant-domain allowlist metrics (TenantDomainsService).
	 * Called after every refresh attempt (success or failure) so the gauges
	 * always reflect current state; `lastSuccessfulRefreshAt` of `undefined`
	 * (never successfully refreshed) is reported as `0`, the Prometheus
	 * convention for "no value yet" on a timestamp gauge.
	 */
	updateTenantDomainsMetrics(domainCount: number, lastSuccessfulRefreshAt: number | undefined): void {
		this.tenantDomainsCount.set(domainCount)
		this.tenantDomainsLastRefreshTimestamp.set(lastSuccessfulRefreshAt ? lastSuccessfulRefreshAt / 1000 : 0)
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
	 * Update CPU usage metrics
	 */
	updateCpuUsage(userPercent: number, systemPercent: number): void {
		this.cpuUsage.set({ type: 'user' }, userPercent)
		this.cpuUsage.set({ type: 'system' }, systemPercent)
		this.cpuUsage.set({ type: 'total' }, userPercent + systemPercent)
	}

	/**
	 * Update load average metrics
	 */
	updateLoadAverage(load1: number, load5: number, load15: number): void {
		this.loadAverage.set({ period: '1m' }, load1)
		this.loadAverage.set({ period: '5m' }, load5)
		this.loadAverage.set({ period: '15m' }, load15)
	}

	/**
	 * Record event loop lag
	 */
	recordEventLoopLag(lag: number): void {
		this.eventLoopLag.observe(lag)
	}

	/**
	 * Stop all metric collection intervals (useful for testing and shutdown)
	 */
	stopMetricsCollection(): void {
		if (this.systemMetricsInterval) {
			clearInterval(this.systemMetricsInterval)
			this.systemMetricsInterval = undefined
		}

		if (this.performanceMetricsInterval) {
			clearInterval(this.performanceMetricsInterval)
			this.performanceMetricsInterval = undefined
		}

		this._logger.log('Stopped periodic metrics collection')
	}

	private startPeriodicMetricsCollection(): void {
		// unref: collection must never keep the process (or a spec worker) alive.
		this.systemMetricsInterval = setInterval(() => {
			this.collectSystemMetrics()
		}, this.systemMetricsIntervalMs).unref()

		this.performanceMetricsInterval = setInterval(() => {
			this.collectPerformanceMetrics()
		}, this.performanceMetricsIntervalMs).unref()

		this._logger.log(`Started periodic metrics collection (system: ${this.systemMetricsIntervalMs}ms, performance: ${this.performanceMetricsIntervalMs}ms)`)
	}

	private collectSystemMetrics(): void {
		try {
			const memoryUsage = process.memoryUsage()
			this.updateMemoryMetrics({
				rss: memoryUsage.rss,
				heapTotal: memoryUsage.heapTotal,
				heapUsed: memoryUsage.heapUsed,
				external: memoryUsage.external,
			})

			const cpuUsage = process.cpuUsage()
			const now = Date.now()
			const elapsedMs = now - this.previousCpuTime
			if (elapsedMs > 0) {
				// Delta-based: microseconds of CPU time per millisecond of wall time, as percentage
				const userDelta = cpuUsage.user - this.previousCpuUsage.user
				const systemDelta = cpuUsage.system - this.previousCpuUsage.system
				const userPercent = (userDelta / 1000 / elapsedMs) * 100
				const systemPercent = (systemDelta / 1000 / elapsedMs) * 100
				this.updateCpuUsage(userPercent, systemPercent)
			}
			this.previousCpuUsage = { user: cpuUsage.user, system: cpuUsage.system }
			this.previousCpuTime = now

			const loadAvg = os.loadavg()
			this.updateLoadAverage(loadAvg[0], loadAvg[1], loadAvg[2])

			const uptimeSeconds = (Date.now() - this.startTime) / 1000
			this.uptime.set(uptimeSeconds)

			this.collectDiskSpaceMetrics()

			this._logger.debug('System metrics collected')
		}
		catch (error: unknown) {
			this._logger.error(`Failed to collect system metrics: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined)
			this.recordError('metrics_collection', 'system_metrics')
		}
	}

	private collectPerformanceMetrics(): void {
		try {
			const start = process.hrtime.bigint()
			setImmediate(() => {
				const lag = Number(process.hrtime.bigint() - start) / 1e9
				this.recordEventLoopLag(lag)
			})
		}
		catch (error: unknown) {
			this._logger.error(`Failed to collect performance metrics: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined)
			this.recordError('metrics_collection', 'performance_metrics')
		}
	}

	/**
	 * statfs reports filesystem-level usage, so the cache directory is the only
	 * path worth sampling. `bavail` (space available to this process) matches
	 * DiskSpaceHealthIndicator. A missing directory is not an error here.
	 */
	private async collectDiskSpaceMetrics(): Promise<void> {
		try {
			const stats = await fs.promises.statfs(this.storagePath)
			const total = stats.bsize * stats.blocks
			const free = stats.bsize * stats.bavail
			this.updateDiskSpaceMetrics(this.storagePath, total, total - free, free)
		}
		catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return
			}
			this._logger.error(`Failed to collect disk space metrics: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined)
			this.recordError('metrics_collection', 'disk_space')
		}
	}
}
