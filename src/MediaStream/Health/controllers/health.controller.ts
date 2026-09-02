import type {
	HealthCheckResult,
	HealthCheckStatus,
	HealthIndicatorFunction,
	HealthIndicatorResult,
} from '@nestjs/terminus'
import type { Response } from 'express'
import type { DiskSpaceInfo } from '../indicators/disk-space-health.indicator.js'
import type { MemoryInfo } from '../indicators/memory-health.indicator.js'
import * as process from 'node:process'
import * as v8 from 'node:v8'
import { Controller, Get, HttpCode, HttpStatus, Post, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common'
import { HealthCheck, HealthCheckService } from '@nestjs/terminus'
import { CacheHealthIndicator } from '#microservice/Cache/indicators/cache-health.indicator'
import { RedisHealthIndicator } from '#microservice/Cache/indicators/redis-health.indicator'
import { InternalSecretGuard } from '#microservice/common/guards/internal-secret.guard'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { isShuttingDown } from '#microservice/common/utils/graceful-shutdown.util'
import { nodeEnv } from '#microservice/common/utils/runtime-env.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { HttpHealthIndicator } from '#microservice/HTTP/indicators/http-health.indicator'
import { HttpClientService } from '#microservice/HTTP/services/http-client.service'
import { StorageHealthIndicator } from '#microservice/Storage/indicators/storage-health.indicator'
import { TenantDomainsHealthIndicator } from '#microservice/Validation/indicators/tenant-domains-health.indicator'
import { HealthDetailGuard } from '../guards/health-detail.guard.js'
import { DiskSpaceHealthIndicator } from '../indicators/disk-space-health.indicator.js'
import { HEAP_CRITICAL_RATIO, MemoryHealthIndicator } from '../indicators/memory-health.indicator.js'
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
		private readonly storageHealthIndicator: StorageHealthIndicator,
		private readonly sharpHealthIndicator: SharpHealthIndicator,
		private readonly tenantDomainsHealthIndicator: TenantDomainsHealthIndicator,
		private readonly httpClientService: HttpClientService,
	) {}

	/** Every indicator, in report order; /health and /health/detailed share it. */
	private get allChecks(): HealthIndicatorFunction[] {
		return [
			() => this.diskSpaceIndicator.isHealthy(),
			() => this.memoryIndicator.isHealthy(),
			() => this.httpHealthIndicator.isHealthy(),
			() => this.cacheHealthIndicator.isHealthy(),
			() => this.redisHealthIndicator.isHealthy(),
			() => this.storageHealthIndicator.isHealthy(),
			() => this.sharpHealthIndicator.isHealthy(),
			() => this.tenantDomainsHealthIndicator.isHealthy(),
		]
	}

	/**
	 * Run an aggregate health check and always answer with the health report.
	 *
	 * HealthCheckService signals failure by throwing a ServiceUnavailableException
	 * that carries the HealthCheckResult, and the global MediaStreamExceptionFilter
	 * rewrites every HttpException into a flat error envelope — which discarded the
	 * per-indicator breakdown exactly when something was down and an operator
	 * needed it. Unwrapping the report here and setting the status on the response
	 * keeps the 503 while preserving the body. These endpoints already return the
	 * same report with 200 when healthy, so nothing new is exposed.
	 */
	private async runCheck(
		res: Response,
		indicators: HealthIndicatorFunction[],
	): Promise<HealthCheckResult> {
		try {
			return await this.health.check(indicators)
		}
		catch (error: unknown) {
			if (error instanceof ServiceUnavailableException) {
				const payload = error.getResponse()
				if (typeof payload === 'object' && payload !== null && 'details' in payload) {
					res.status(HttpStatus.SERVICE_UNAVAILABLE)
					return payload as HealthCheckResult
				}
			}
			throw error
		}
	}

	@Get()
	@HealthCheck()
	async check(@Res({ passthrough: true }) res: Response): Promise<HealthCheckResult> {
		return this.runCheck(res, this.allChecks)
	}

	@Get('detailed')
	@UseGuards(HealthDetailGuard)
	async getDetailedHealth(@Res({ passthrough: true }) res: Response): Promise<{
		status: HealthCheckStatus
		info: HealthIndicatorResult
		error: HealthIndicatorResult
		details: HealthIndicatorResult
		timestamp: string
		uptime: number
		environment: string
		resources: {
			disk: DiskSpaceInfo | null
			memory: MemoryInfo | null
		}
	}> {
		const healthResults = await this.runCheck(res, this.allChecks)

		// These read the resources directly, outside the indicator machinery, so
		// an unreadable disk used to throw straight out of the handler and take
		// the whole diagnostic response with it — losing the health report too.
		// A snapshot that cannot be taken is reported as null; the corresponding
		// indicator above already carries the failure detail.
		const [diskInfo, memoryInfo] = await Promise.all([
			this.diskSpaceIndicator.getCurrentDiskInfo().catch((error: unknown) => {
				CorrelatedLogger.warn(
					`Detailed health: disk snapshot unavailable: ${errorMessage(error)}`,
					HealthController.name,
				)
				return null
			}),
			Promise.resolve().then(() => this.memoryIndicator.getCurrentMemoryInfo()).catch((error: unknown) => {
				CorrelatedLogger.warn(
					`Detailed health: memory snapshot unavailable: ${errorMessage(error)}`,
					HealthController.name,
				)
				return null
			}),
		])

		return {
			status: healthResults.status,
			info: (healthResults.info || {}) as HealthIndicatorResult,
			error: (healthResults.error || {}) as HealthIndicatorResult,
			details: healthResults.details,
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			environment: nodeEnv(),
			resources: {
				disk: diskInfo,
				memory: memoryInfo,
			},
		}
	}

	@Get('ready')
	async readiness(@Res({ passthrough: true }) res: Response): Promise<{ status: string, timestamp: string, checks?: HealthIndicatorResult }> {
		// Drain traffic during shutdown: failing readiness here makes the K8s
		// Service stop routing new requests to this pod while existing
		// in-flight requests finish. Liveness stays passing so kubelet does
		// not race the graceful-shutdown sequence with SIGKILL.
		// Status is set on the response rather than thrown: the global
		// MediaStreamExceptionFilter rewrites every HttpException into a flat
		// error envelope, which would strip this body on the way out.
		if (isShuttingDown()) {
			res.status(HttpStatus.SERVICE_UNAVAILABLE)
			return {
				status: 'shutting-down',
				timestamp: new Date().toISOString(),
			}
		}

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
			// Terminus 12 dropped HealthCheckError; HealthCheckService now signals
			// failure with a ServiceUnavailableException whose response body is the
			// HealthCheckResult itself.
			const payload = error instanceof ServiceUnavailableException
				? error.getResponse() as HealthCheckResult
				: undefined

			res.status(HttpStatus.SERVICE_UNAVAILABLE)
			return {
				status: 'not ready',
				timestamp: new Date().toISOString(),
				checks: payload?.details,
			}
		}
	}

	@Get('dependencies')
	@UseGuards(HealthDetailGuard)
	async dependencies(@Res({ passthrough: true }) res: Response): Promise<HealthCheckResult> {
		// External-dependency diagnostic endpoint. Separate from /health/ready
		// so ops can observe Redis/upstream HTTP state without coupling it to
		// K8s readiness gating.
		//
		// Internal-IP only, same as /health/detailed: the report names the Redis
		// host/port and the upstream URLs media-stream fetches from, which is
		// internal topology. No K8s probe uses this route (they use /health/live
		// and /health/ready), and the ingress only routes /media_stream-image, so
		// restricting it costs nothing operationally.
		return this.runCheck(res, [
			() => this.redisHealthIndicator.isHealthy(),
			() => this.httpHealthIndicator.isHealthy(),
			() => this.cacheHealthIndicator.isHealthy(),
			() => this.storageHealthIndicator.isHealthy(),
			() => this.tenantDomainsHealthIndicator.isHealthy(),
		])
	}

	@Get('live')
	async liveness(): Promise<{ status: string, timestamp: string, uptime: number }> {
		// Liveness MUST stay passing while the process is alive. It does not
		// fail during graceful shutdown (that is /health/ready's job) — failing
		// it would make kubelet send SIGKILL and race the in-progress shutdown.
		//
		// heapUsed against V8's actual ceiling (`heap_size_limit`), not heapTotal,
		// which V8 grows lazily during normal GC churn. True OOM is handled by
		// the kernel / K8s memory limit; this soft guard shares its threshold
		// with MemoryHealthIndicator.
		const memUsage = process.memoryUsage()
		const heapLimit = v8.getHeapStatistics().heap_size_limit
		const heapPercent = memUsage.heapUsed / heapLimit
		if (heapPercent > HEAP_CRITICAL_RATIO) {
			throw new ServiceUnavailableException({
				status: 'heap-pressure',
				heapUsed: memUsage.heapUsed,
				heapLimit,
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

	/**
	 * Force-reset the HTTP circuit breaker to closed state.
	 * Protected by InternalSecretGuard — requires x-internal-secret header.
	 * Should only be called by ops/admin tooling after a confirmed upstream recovery.
	 */
	@Post('circuit-breaker/reset')
	@UseGuards(InternalSecretGuard)
	@HttpCode(HttpStatus.OK)
	resetCircuitBreaker(): { timestamp: string, message: string } {
		this.httpClientService.resetCircuitBreaker()
		return {
			timestamp: new Date().toISOString(),
			message: 'Circuit breaker reset to closed state',
		}
	}
}
