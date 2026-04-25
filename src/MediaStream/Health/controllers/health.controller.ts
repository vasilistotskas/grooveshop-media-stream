import type {
	HealthCheckResult,
	HealthCheckStatus,
	HealthIndicatorResult,
} from '@nestjs/terminus'
import type { DiskSpaceInfo } from '../indicators/disk-space-health.indicator.js'
import type { MemoryInfo } from '../indicators/memory-health.indicator.js'
import * as process from 'node:process'
import { CacheHealthIndicator } from '#microservice/Cache/indicators/cache-health.indicator'
import { RedisHealthIndicator } from '#microservice/Cache/indicators/redis-health.indicator'
import { isShuttingDown } from '#microservice/common/utils/graceful-shutdown.util'
import { HttpHealthIndicator } from '#microservice/HTTP/indicators/http-health.indicator'
import { HttpClientService } from '#microservice/HTTP/services/http-client.service'
import { JobQueueHealthIndicator } from '#microservice/Queue/indicators/job-queue-health.indicator'
import { StorageHealthIndicator } from '#microservice/Storage/indicators/storage-health.indicator'
import { Controller, Get, ServiceUnavailableException, UseGuards } from '@nestjs/common'
import { HealthCheck, HealthCheckError, HealthCheckService } from '@nestjs/terminus'
import { HealthDetailGuard } from '../guards/health-detail.guard.js'
import { DiskSpaceHealthIndicator } from '../indicators/disk-space-health.indicator.js'
import { MemoryHealthIndicator } from '../indicators/memory-health.indicator.js'
import { SharpHealthIndicator } from '../indicators/sharp-health.indicator.js'

@Controller('health')
export class HealthController {
	constructor(
		private readonly health: HealthCheckService,
		private readonly diskSpaceIndicator: DiskSpaceHealthIndicator,
		private readonly memoryIndicator: MemoryHealthIndicator,
		private readonly httpHealthIndicator: HttpHealthIndicator,
		private readonly cacheHealthIndicator: CacheHealthIndicator,
		private readonly redisHealthIndicator: RedisHealthIndicator,
		private readonly jobQueueHealthIndicator: JobQueueHealthIndicator,
		private readonly storageHealthIndicator: StorageHealthIndicator,
		private readonly sharpHealthIndicator: SharpHealthIndicator,
		private readonly httpClientService: HttpClientService,
	) {}

	@Get()
	@HealthCheck()
	async check(): Promise<HealthCheckResult> {
		return this.health.check([
			() => this.diskSpaceIndicator.isHealthy(),
			() => this.memoryIndicator.isHealthy(),
			() => this.httpHealthIndicator.isHealthy(),
			() => this.cacheHealthIndicator.isHealthy(),
			() => this.redisHealthIndicator.isHealthy(),
			() => this.jobQueueHealthIndicator.isHealthy(),
			() => this.storageHealthIndicator.isHealthy(),
			() => this.sharpHealthIndicator.isHealthy(),
		])
	}

	@Get('detailed')
	@UseGuards(HealthDetailGuard)
	async getDetailedHealth(): Promise<{
		status: HealthCheckStatus
		info: HealthIndicatorResult
		error: HealthIndicatorResult
		details: HealthIndicatorResult
		timestamp: string
		uptime: number
		environment: string
		resources: {
			disk: DiskSpaceInfo
			memory: MemoryInfo
		}
	}> {
		const healthResults = await this.health.check([
			() => this.diskSpaceIndicator.isHealthy(),
			() => this.memoryIndicator.isHealthy(),
			() => this.httpHealthIndicator.isHealthy(),
			() => this.cacheHealthIndicator.isHealthy(),
			() => this.redisHealthIndicator.isHealthy(),
			() => this.jobQueueHealthIndicator.isHealthy(),
			() => this.storageHealthIndicator.isHealthy(),
			() => this.sharpHealthIndicator.isHealthy(),
		])

		const diskInfo = await this.diskSpaceIndicator.getCurrentDiskInfo()
		const memoryInfo = this.memoryIndicator.getCurrentMemoryInfo()

		return {
			status: healthResults.status,
			info: (healthResults.info || {}) as HealthIndicatorResult,
			error: (healthResults.error || {}) as HealthIndicatorResult,
			details: healthResults.details,
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			environment: process.env.NODE_ENV || 'development',
			resources: {
				disk: diskInfo,
				memory: memoryInfo,
			},
		}
	}

	@Get('ready')
	async readiness(): Promise<{ status: string, timestamp: string, checks?: any }> {
		try {
			// Readiness probe: checks ONLY in-process state required to serve
			// traffic. Do NOT include external dependencies (Redis, upstream HTTP)
			// here — a transient Redis blip would otherwise mark every pod
			// NotReady simultaneously, triggering a cascading K8s restart storm.
			// The service degrades gracefully without Redis (multi-layer cache
			// falls through to memory + file system), so Redis health is
			// diagnostic, not gating.
			// Use GET /health for full diagnostics including external deps,
			// or GET /health/dependencies for an external-dep-only snapshot.
			const result = await this.health.check([
				() => this.memoryIndicator.isHealthy(),
				() => this.sharpHealthIndicator.isHealthy(),
			])

			return {
				status: 'ready',
				timestamp: new Date().toISOString(),
				checks: result.details,
			}
		}
		catch (error: unknown) {
			throw new ServiceUnavailableException({
				status: 'not ready',
				timestamp: new Date().toISOString(),
				checks: error instanceof HealthCheckError ? error.causes : undefined,
			})
		}
	}

	@Get('dependencies')
	async dependencies(): Promise<HealthCheckResult> {
		// External-dependency diagnostic endpoint. Separate from /health/ready
		// so ops can observe Redis/upstream HTTP state without coupling it to
		// K8s readiness gating.
		return this.health.check([
			() => this.redisHealthIndicator.isHealthy(),
			() => this.httpHealthIndicator.isHealthy(),
			() => this.cacheHealthIndicator.isHealthy(),
			() => this.jobQueueHealthIndicator.isHealthy(),
			() => this.storageHealthIndicator.isHealthy(),
		])
	}

	@Get('live')
	async liveness(): Promise<{ status: string, timestamp: string, uptime: number }> {
		if (isShuttingDown()) {
			throw new ServiceUnavailableException({ status: 'shutting-down' })
		}

		const memUsage = process.memoryUsage()
		const heapPercent = memUsage.heapUsed / memUsage.heapTotal
		if (heapPercent > 0.95) {
			throw new ServiceUnavailableException({
				status: 'heap-pressure',
				heapUsed: memUsage.heapUsed,
				heapTotal: memUsage.heapTotal,
				heapPercent: (heapPercent * 100).toFixed(1),
			})
		}

		return {
			status: 'alive',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
		}
	}

	@Get('circuit-breaker')
	async circuitBreakerStatus(): Promise<{
		timestamp: string
		circuitBreaker: {
			isOpen: boolean
		}
	}> {
		const isOpen = this.httpClientService.isCircuitOpen()

		return {
			timestamp: new Date().toISOString(),
			circuitBreaker: {
				isOpen,
			},
		}
	}
}
