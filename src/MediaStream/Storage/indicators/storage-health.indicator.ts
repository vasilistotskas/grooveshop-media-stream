import type { HealthIndicatorResult } from '@nestjs/terminus'
import { Injectable } from '@nestjs/common'
import { formatBytes } from '#microservice/common/utils/bytes.util'
import { BaseHealthIndicator } from '#microservice/Health/base/base-health-indicator'
import { StorageCleanupService } from '../services/storage-cleanup.service.js'
import { isExpired, StorageMonitoringService } from '../services/storage-monitoring.service.js'

const HEALTH_CHECK_TIMEOUT_MS = 5000

export interface StorageHealthDetails {
	totalFiles: number
	totalSize: string
	/** Whole percent of `storage.criticalSize` in use. */
	usagePercentage: number
	entries: number
	orphans: number
	expired: number
	oldestEntry: string | null
	newestEntry: string | null
	cleanupStatus: {
		enabled: boolean
		dryRun: boolean
		lastCleanup: string | null
		nextCleanup: string | null
	}
	thresholds: {
		warningSize: string
		criticalSize: string
		warningFileCount: number
		criticalFileCount: number
	}
}

@Injectable()
export class StorageHealthIndicator extends BaseHealthIndicator {
	constructor(
		private readonly storageMonitoring: StorageMonitoringService,
		private readonly storageCleanup: StorageCleanupService,
	) {
		super('storage', HEALTH_CHECK_TIMEOUT_MS)
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		return this.executeWithTimeout(async () => {
			const { status, issues, inventory } = await this.storageMonitoring.checkThresholds()
			const cleanup = this.storageCleanup.getCleanupStatus()
			const { thresholds } = this.storageMonitoring
			const now = Date.now()

			let expired = 0
			let oldest = Number.POSITIVE_INFINITY
			let newest = Number.NEGATIVE_INFINITY
			for (const entry of inventory.entries) {
				if (isExpired(entry, now)) {
					expired++
				}
				oldest = Math.min(oldest, entry.dateCreated)
				newest = Math.max(newest, entry.dateCreated)
			}

			const details: StorageHealthDetails = {
				totalFiles: inventory.totalFiles,
				totalSize: formatBytes(inventory.totalSize),
				usagePercentage: Math.round((inventory.totalSize / thresholds.criticalSize) * 100),
				entries: inventory.entries.length,
				orphans: inventory.orphans.length,
				expired,
				oldestEntry: inventory.entries.length ? new Date(oldest).toISOString() : null,
				newestEntry: inventory.entries.length ? new Date(newest).toISOString() : null,
				cleanupStatus: {
					enabled: cleanup.enabled,
					dryRun: cleanup.dryRun,
					lastCleanup: cleanup.lastCleanup?.toISOString() ?? null,
					nextCleanup: cleanup.nextCleanup?.toISOString() ?? null,
				},
				thresholds: {
					warningSize: formatBytes(thresholds.warningSize),
					criticalSize: formatBytes(thresholds.criticalSize),
					warningFileCount: thresholds.warningFileCount,
					criticalFileCount: thresholds.criticalFileCount,
				},
			}

			if (status === 'critical') {
				return this.createUnhealthyResult(`Storage in critical state: ${issues.join(', ')}`, details)
			}
			if (status === 'warning') {
				return this.createHealthyResult({ ...details, detailStatus: 'warning', warnings: issues })
			}
			return this.createHealthyResult(details)
		})
	}

	protected getDescription(): string {
		return 'Cache tier inventory against the storage thresholds, plus cleanup status'
	}
}
