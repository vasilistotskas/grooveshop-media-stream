import * as process from 'node:process'
import { CacheHealthIndicator } from '@microservice/Cache/indicators/cache-health.indicator'
import { RedisHealthIndicator } from '@microservice/Cache/indicators/redis-health.indicator'
import { ConfigService } from '@microservice/Config/config.service'
import { DiskSpaceHealthIndicator, DiskSpaceInfo } from '@microservice/Health/indicators/disk-space-health.indicator'
import { MemoryHealthIndicator, MemoryInfo } from '@microservice/Health/indicators/memory-health.indicator'
import { HttpHealthIndicator } from '@microservice/HTTP/indicators/http-health.indicator'
import { HttpClientService } from '@microservice/HTTP/services/http-client.service'
import { AlertingHealthIndicator } from '@microservice/Monitoring/indicators/alerting-health.indicator'
import { SystemHealthIndicator } from '@microservice/Monitoring/indicators/system-health.indicator'
import { JobQueueHealthIndicator } from '@microservice/Queue/indicators/job-queue-health.indicator'
import { StorageHealthIndicator } from '@microservice/Storage/indicators/storage-health.indicator'
import { Controller, Get, Post } from '@nestjs/common'
import {
	HealthCheck,
	HealthCheckResult,
	HealthCheckService,
	HealthCheckStatus,
	HealthIndicatorResult,
} from '@nestjs/terminus'

@Controller('health')
export class HealthController {
	constructor(
		private readonly health: HealthCheckService,
		private readonly diskSpaceIndicator: DiskSpaceHealthIndicator,
		private readonly memoryIndicator: MemoryHealthIndicator,
		private readonly httpHealthIndicator: HttpHealthIndicator,
		private readonly cacheHealthIndicator: CacheHealthIndicator,
		private readonly redisHealthIndicator: RedisHealthIndicator,
		private readonly alertingHealthIndicator: AlertingHealthIndicator,
		private readonly systemHealthIndicator: SystemHealthIndicator,
		private readonly jobQueueHealthIndicator: JobQueueHealthIndicator,
		private readonly storageHealthIndicator: StorageHealthIndicator,
		private readonly _configService: ConfigService,
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
			() => this.alertingHealthIndicator.isHealthy(),
			() => this.systemHealthIndicator.isHealthy(),
			() => this.jobQueueHealthIndicator.isHealthy(),
			() => this.storageHealthIndicator.isHealthy(),
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
		version: string
		environment: string
		systemInfo: {
			platform: NodeJS.Platform
			arch: NodeJS.Architecture
			nodeVersion: string
			pid: number
		}
		resources: {
			disk: DiskSpaceInfo
			memory: MemoryInfo
		}
		configuration: {
			monitoring: {
				enabled: boolean
				metricsPort: number
			}
			cache: {
				fileDirectory: string
				memoryMaxSize: number
			}
		}
	}> {
		const healthResults = await this.health.check([
			() => this.diskSpaceIndicator.isHealthy(),
			() => this.memoryIndicator.isHealthy(),
			() => this.httpHealthIndicator.isHealthy(),
			() => this.cacheHealthIndicator.isHealthy(),
			() => this.redisHealthIndicator.isHealthy(),
			() => this.alertingHealthIndicator.isHealthy(),
			() => this.systemHealthIndicator.isHealthy(),
			() => this.jobQueueHealthIndicator.isHealthy(),
			() => this.storageHealthIndicator.isHealthy(),
		])

		const diskInfo = await this.diskSpaceIndicator.getCurrentDiskInfo()
		const memoryInfo = this.memoryIndicator.getCurrentMemoryInfo()

		return {
			status: healthResults.status,
			info: healthResults.info || {},
			error: healthResults.error || {},
			details: healthResults.details,
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			version: process.version,
			environment: process.env.NODE_ENV || 'development',
			systemInfo: {
				platform: process.platform,
				arch: process.arch,
				nodeVersion: process.version,
				pid: process.pid,
			},
			resources: {
				disk: diskInfo,
				memory: memoryInfo,
			},
			configuration: {
				monitoring: {
					enabled: this._configService.get('monitoring.enabled'),
					metricsPort: this._configService.get('monitoring.metricsPort'),
				},
				cache: {
					fileDirectory: this._configService.get('cache.file.directory'),
					memoryMaxSize: this._configService.get('cache.memory.maxSize'),
				},
			},
		}
	}

	@Get('ready')
	async readiness(): Promise<{ status: string, timestamp: string, checks?: any, error?: string }> {
		try {
			const result = await this.health.check([
				() => this.diskSpaceIndicator.isHealthy(),
				() => this.memoryIndicator.isHealthy(),
				() => this.httpHealthIndicator.isHealthy(),
				() => this.cacheHealthIndicator.isHealthy(),
				() => this.redisHealthIndicator.isHealthy(),
				() => this.alertingHealthIndicator.isHealthy(),
				() => this.systemHealthIndicator.isHealthy(),
				() => this.jobQueueHealthIndicator.isHealthy(),
				() => this.storageHealthIndicator.isHealthy(),
			])

			return {
				status: 'ready',
				timestamp: new Date().toISOString(),
				checks: result.details,
			}
		}
		catch (error: unknown) {
			return {
				status: 'not ready',
				timestamp: new Date().toISOString(),
				error: error instanceof Error ? (error as Error).message : 'Unknown error',
			}
		}
	}

	@Get('live')
	async liveness(): Promise<{ status: string, timestamp: string, uptime: number, pid: number }> {
		return {
			status: 'alive',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			pid: process.pid,
		}
	}

	@Get('circuit-breaker')
	async circuitBreakerStatus(): Promise<{
		timestamp: string
		circuitBreaker: {
			isOpen: boolean
			stats: any
		}
		httpClient: {
			stats: any
		}
	}> {
		const isOpen = this.httpClientService.isCircuitOpen()
		const httpStats = this.httpClientService.getStats()

		return {
			timestamp: new Date().toISOString(),
			circuitBreaker: {
				isOpen,
				stats: httpStats,
			},
			httpClient: {
				stats: httpStats,
			},
		}
	}

	@Post('circuit-breaker/reset')
	async resetCircuitBreaker(): Promise<{
		timestamp: string
		message: string
		previousState: any
	}> {
		const previousStats = this.httpClientService.getStats()

		this.httpClientService.resetCircuitBreaker()
		this.httpClientService.resetStats()

		return {
			timestamp: new Date().toISOString(),
			message: 'Circuit breaker has been reset successfully',
			previousState: previousStats,
		}
	}
}
