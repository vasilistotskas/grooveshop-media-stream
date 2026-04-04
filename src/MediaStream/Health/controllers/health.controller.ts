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
import { HttpHealthIndicator } from '#microservice/HTTP/indicators/http-health.indicator'
import { HttpClientService } from '#microservice/HTTP/services/http-client.service'
import { JobQueueHealthIndicator } from '#microservice/Queue/indicators/job-queue-health.indicator'
import { StorageHealthIndicator } from '#microservice/Storage/indicators/storage-health.indicator'
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { HealthCheck, HealthCheckError, HealthCheckService } from '@nestjs/terminus'
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
			// Lightweight readiness check - only critical dependencies
			// Full health check is available at /health for detailed diagnostics
			const result = await this.health.check([
				() => this.memoryIndicator.isHealthy(),
				() => this.redisHealthIndicator.isHealthy(),
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

	@Get('live')
	async liveness(): Promise<{ status: string, timestamp: string, uptime: number }> {
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
