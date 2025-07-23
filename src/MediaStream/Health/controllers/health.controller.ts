import * as process from 'node:process'
import { RedisHealthIndicator } from '@microservice/Cache/indicators/redis-health.indicator'
import { ConfigService } from '@microservice/Config/config.service'
import { DiskSpaceHealthIndicator, DiskSpaceInfo } from '@microservice/Health/indicators/disk-space-health.indicator'
import { MemoryHealthIndicator, MemoryInfo } from '@microservice/Health/indicators/memory-health.indicator'
import { HttpHealthIndicator } from '@microservice/HTTP/indicators/http-health.indicator'
import { Controller, Get } from '@nestjs/common'
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
		private readonly redisHealthIndicator: RedisHealthIndicator,
		private readonly configService: ConfigService,
	) {}

	@Get()
	@HealthCheck()
	async check(): Promise<HealthCheckResult> {
		return this.health.check([
			() => this.diskSpaceIndicator.isHealthy(),
			() => this.memoryIndicator.isHealthy(),
			() => this.httpHealthIndicator.isHealthy('http'),
			() => this.redisHealthIndicator.isHealthy(),
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
			() => this.httpHealthIndicator.isHealthy('http'),
			() => this.redisHealthIndicator.isHealthy(),
		])

		const diskInfo = await this.diskSpaceIndicator.getCurrentDiskInfo()
		const memoryInfo = this.memoryIndicator.getCurrentMemoryInfo()

		return {
			status: healthResults.status,
			info: healthResults.info,
			error: healthResults.error,
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
					enabled: this.configService.get('monitoring.enabled'),
					metricsPort: this.configService.get('monitoring.metricsPort'),
				},
				cache: {
					fileDirectory: this.configService.get('cache.file.directory'),
					memoryMaxSize: this.configService.get('cache.memory.maxSize'),
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
				() => this.httpHealthIndicator.isHealthy('http'),
				() => this.redisHealthIndicator.isHealthy(),
			])

			return {
				status: 'ready',
				timestamp: new Date().toISOString(),
				checks: result.details,
			}
		}
		catch (error) {
			return {
				status: 'not ready',
				timestamp: new Date().toISOString(),
				error: error instanceof Error ? error.message : 'Unknown error',
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
}
