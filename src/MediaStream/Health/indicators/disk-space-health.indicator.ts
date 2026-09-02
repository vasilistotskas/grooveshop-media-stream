import type { HealthIndicatorResult } from '@nestjs/terminus'
import { promises as fs } from 'node:fs'
import { Injectable } from '@nestjs/common'
import { bytesToMb } from '#microservice/common/utils/bytes.util'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { BaseHealthIndicator } from '../base/base-health-indicator.js'

const DISK_WARNING_RATIO = 0.8
const DISK_CRITICAL_RATIO = 0.9
const TIMEOUT_MS = 3000

export interface DiskSpaceInfo {
	/** Megabytes */
	total: number
	/** Megabytes */
	free: number
	/** Megabytes */
	used: number
	usedPercentage: number
	path: string
}

@Injectable()
export class DiskSpaceHealthIndicator extends BaseHealthIndicator {
	private readonly storagePath: string

	constructor(configService: ConfigService) {
		super('disk_space', TIMEOUT_MS)
		this.storagePath = storageDirectory(configService)
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		return this.executeWithTimeout(async () => {
			const diskInfo = await this.getDiskSpaceInfo()

			if (diskInfo.usedPercentage >= DISK_CRITICAL_RATIO) {
				return this.createUnhealthyResult(
					`Disk space critically low: ${(diskInfo.usedPercentage * 100).toFixed(1)}% used`,
					diskInfo,
				)
			}

			return this.createHealthyResult({
				...diskInfo,
				detailStatus: diskInfo.usedPercentage >= DISK_WARNING_RATIO ? 'warning' : 'healthy',
				warningThreshold: DISK_WARNING_RATIO,
				criticalThreshold: DISK_CRITICAL_RATIO,
			})
		})
	}

	protected getDescription(): string {
		return `Monitors disk space usage for storage directory: ${this.storagePath}`
	}

	/** Snapshot without the health-check wrapper (used by /health/detailed). */
	async getCurrentDiskInfo(): Promise<DiskSpaceInfo> {
		return this.getDiskSpaceInfo()
	}

	/**
	 * A statfs failure must propagate: `isHealthy()` converts it into a `down`
	 * result. Returning zeroed info would report 0% used and mask a real fault.
	 */
	private async getDiskSpaceInfo(): Promise<DiskSpaceInfo> {
		try {
			await fs.mkdir(this.storagePath, { recursive: true })
			const stats = await fs.statfs(this.storagePath)

			const total = stats.blocks * stats.bsize
			const free = stats.bavail * stats.bsize
			const used = total - free

			return {
				total: bytesToMb(total),
				free: bytesToMb(free),
				used: bytesToMb(used),
				usedPercentage: used / total,
				path: this.storagePath,
			}
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Unable to read disk space for ${this.storagePath}: ${errorMessage(error)}`, undefined, DiskSpaceHealthIndicator.name)
			throw new Error(`Unable to read disk space for storage directory: ${this.storagePath}`)
		}
	}
}
