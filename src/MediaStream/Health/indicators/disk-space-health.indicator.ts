import type { HealthIndicatorResult } from '@nestjs/terminus'
import type { HealthCheckOptions } from '../interfaces/health-indicator.interface.js'
import { promises as fs } from 'node:fs'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '#microservice/Config/config.service'
import { BaseHealthIndicator } from '../base/base-health-indicator.js'

export interface DiskSpaceInfo {
	total: number
	free: number
	used: number
	usedPercentage: number
	path: string
}

@Injectable()
export class DiskSpaceHealthIndicator extends BaseHealthIndicator {
	private readonly storagePath: string
	private readonly _warningThreshold: number
	private readonly _criticalThreshold: number

	constructor(private readonly _configService: ConfigService) {
		const options: HealthCheckOptions = {
			timeout: 3000,
			threshold: 0.9,
		}

		super('disk_space', options)

		this.storagePath = this._configService.get('cache.file.directory')
		this._warningThreshold = 0.8
		this._criticalThreshold = 0.9
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		return this.executeWithTimeout(async () => {
			const diskInfo = await this.getDiskSpaceInfo()

			if (diskInfo.usedPercentage >= this._criticalThreshold) {
				return this.createUnhealthyResult(
					`Disk space critically low: ${(diskInfo.usedPercentage * 100).toFixed(1)}% used`,
					diskInfo,
				)
			}

			const detailStatus = diskInfo.usedPercentage >= this._warningThreshold ? 'warning' : 'healthy'

			return this.createHealthyResult({
				...diskInfo,
				detailStatus,
				warningThreshold: this._warningThreshold,
				criticalThreshold: this._criticalThreshold,
			})
		})
	}

	protected getDescription(): string {
		return `Monitors disk space usage for storage directory: ${this.storagePath}`
	}

	private async getDiskSpaceInfo(): Promise<DiskSpaceInfo> {
		// A statfs failure must propagate: BaseHealthIndicator.isHealthy()
		// converts it into a 'down' result. Returning zeroed disk info here
		// would report 0% used and mask a real disk failure as healthy.
		try {
			await fs.mkdir(this.storagePath, { recursive: true })

			const stats = await fs.statfs(this.storagePath)

			const total = stats.blocks * stats.bsize
			const free = stats.bavail * stats.bsize
			const used = total - free
			const usedPercentage = used / total

			return {
				total: this.formatBytes(total),
				free: this.formatBytes(free),
				used: this.formatBytes(used),
				usedPercentage,
				path: this.storagePath,
			}
		}
		catch (error: unknown) {
			this.logger.error(`Unable to read disk space for ${this.storagePath}: ${(error as Error).message}`)
			throw new Error(`Unable to read disk space for storage directory: ${this.storagePath}`)
		}
	}

	private formatBytes(bytes: number): number {
		return Math.round(bytes / (1024 * 1024))
	}

	/**
	 * Get current disk space information without health check wrapper
	 */
	async getCurrentDiskInfo(): Promise<DiskSpaceInfo> {
		return this.getDiskSpaceInfo()
	}
}
