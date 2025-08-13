import type { HealthCheckOptions } from '@microservice/Health/interfaces/health-indicator.interface'
import type { HealthIndicatorResult } from '@nestjs/terminus'
import type { AccessPattern, StorageStats } from '../services/storage-monitoring.service'
import { ConfigService } from '@microservice/Config/config.service'
import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator'
import { Injectable } from '@nestjs/common'
import { StorageCleanupService } from '../services/storage-cleanup.service'
import { StorageMonitoringService } from '../services/storage-monitoring.service'

export interface StorageHealthDetails {
	totalFiles: number
	totalSize: string
	usagePercentage: number
	oldestFile: string | null
	newestFile: string | null
	topFileTypes: Array<{ extension: string, count: number }>
	cleanupStatus: {
		enabled: boolean
		lastCleanup: string
		nextCleanup: string
	}
	thresholds: {
		warningSize: string
		criticalSize: string
		warningFileCount: number
		criticalFileCount: number
	}
	recommendations: string[]
}

@Injectable()
export class StorageHealthIndicator extends BaseHealthIndicator {
	constructor(
		private readonly _configService: ConfigService,
		private readonly storageMonitoring: StorageMonitoringService,
		private readonly storageCleanup: StorageCleanupService,
	) {
		const options: HealthCheckOptions = {
			timeout: 5000,
			threshold: 0.9, // 90% storage usage threshold
		}

		super('storage', options)
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		return this.executeWithTimeout(async () => {
			const thresholdCheck = await this.storageMonitoring.checkThresholds()
			const stats = thresholdCheck.stats
			const cleanupStatus = this.storageCleanup.getCleanupStatus()

			// Calculate usage percentage (approximation based on file count and size)
			const maxSize = this._configService.getOptional('storage.maxSize', 1024 * 1024 * 1024) // 1GB default
			const usagePercentage = stats.totalSize / maxSize

			// Generate recommendations
			const recommendations = this.generateRecommendations(thresholdCheck, cleanupStatus)

			// Prepare health details
			const details: StorageHealthDetails = {
				totalFiles: stats.totalFiles,
				totalSize: this.formatBytes(stats.totalSize),
				usagePercentage: Math.round(usagePercentage * 100),
				oldestFile: stats.oldestFile ? stats.oldestFile.toISOString() : null,
				newestFile: stats.newestFile ? stats.newestFile.toISOString() : null,
				topFileTypes: Object.entries(stats.fileTypes)
					.map(([extension, count]) => ({ extension, count }))
					.sort((a: any, b: any) => b.count - a.count)
					.slice(0, 5),
				cleanupStatus: {
					enabled: cleanupStatus.enabled,
					lastCleanup: cleanupStatus.lastCleanup.toISOString(),
					nextCleanup: cleanupStatus.nextCleanup.toISOString(),
				},
				thresholds: {
					warningSize: this.formatBytes(this._configService.getOptional('storage.warningSize', 800 * 1024 * 1024)),
					criticalSize: this.formatBytes(this._configService.getOptional('storage.criticalSize', 1024 * 1024 * 1024)),
					warningFileCount: this._configService.getOptional('storage.warningFileCount', 5000),
					criticalFileCount: this._configService.getOptional('storage.criticalFileCount', 10000),
				},
				recommendations,
			}

			// Determine health status
			if (thresholdCheck.status === 'critical') {
				return this.createUnhealthyResult(
					`Storage in critical state: ${thresholdCheck.issues.join(', ')}`,
					details,
				)
			}

			if (thresholdCheck.status === 'warning') {
				return this.createHealthyResult({
					...details,
					detailStatus: 'warning',
					warnings: thresholdCheck.issues,
				})
			}

			return this.createHealthyResult(details)
		})
	}

	protected getDescription(): string {
		return 'Monitors storage usage, file patterns, and cleanup status with intelligent recommendations'
	}

	/**
	 * Get detailed storage analysis
	 */
	async getStorageAnalysis(): Promise<{
		stats: any
		thresholds: any
		evictionCandidates: any[]
		cleanupRecommendations: string[]
	}> {
		const stats = await this.storageMonitoring.getStorageStats()
		const thresholdCheck = await this.storageMonitoring.checkThresholds()
		const evictionRecommendations = await this.storageMonitoring.getEvictionCandidates()

		return {
			stats,
			thresholds: thresholdCheck,
			evictionCandidates: evictionRecommendations.slice(0, 10), // Top 10 candidates
			cleanupRecommendations: this.generateCleanupRecommendations(stats, thresholdCheck),
		}
	}

	private generateRecommendations(
		thresholdCheck: any,
		cleanupStatus: any,
	): string[] {
		const recommendations: string[] = []

		// Storage size recommendations
		if (thresholdCheck.status === 'critical') {
			recommendations.push('URGENT: Run immediate cleanup to free storage space')
			recommendations.push('Consider increasing storage capacity or reducing retention periods')
		}
		else if (thresholdCheck.status === 'warning') {
			recommendations.push('Schedule cleanup soon to prevent storage issues')
			recommendations.push('Review retention policies for optimization')
		}

		// Cleanup recommendations
		if (!cleanupStatus.enabled) {
			recommendations.push('Enable automatic cleanup to maintain storage health')
		}
		else {
			const timeSinceLastCleanup = Date.now() - cleanupStatus.lastCleanup.getTime()
			const daysSinceCleanup = timeSinceLastCleanup / (1000 * 60 * 60 * 24)

			if (daysSinceCleanup > 7) {
				recommendations.push('Last cleanup was over a week ago - consider running manual cleanup')
			}
		}

		// File pattern recommendations
		if (thresholdCheck.stats.fileTypes['.json'] > 1000) {
			recommendations.push('High number of JSON cache files - consider shorter TTL for cache entries')
		}

		if (thresholdCheck.stats.fileTypes['.webp'] > 500) {
			recommendations.push('Many WebP files stored - ensure image optimization is working correctly')
		}

		// Access pattern recommendations
		const lowAccessFiles = thresholdCheck.stats.accessPatterns.filter((p: AccessPattern) => p.accessCount < 2).length
		if (lowAccessFiles > thresholdCheck.stats.totalFiles * 0.5) {
			recommendations.push('Over 50% of files have low access counts - consider more aggressive eviction')
		}

		return recommendations
	}

	private generateCleanupRecommendations(stats: StorageStats, _thresholdCheck: any): string[] {
		const recommendations: string[] = []

		// Age-based recommendations
		const oldFiles = stats.accessPatterns.filter((p: AccessPattern) => {
			const ageInDays = (Date.now() - p.lastAccessed.getTime()) / (1000 * 60 * 60 * 24)
			return ageInDays > 30
		})

		if (oldFiles.length > 0) {
			const totalOldSize = oldFiles.reduce((sum: number, f: AccessPattern) => sum + f.size, 0)
			recommendations.push(`${oldFiles.length} files older than 30 days (${this.formatBytes(totalOldSize)})`)
		}

		// Size-based recommendations
		const largeFiles = stats.accessPatterns
			.filter((p: AccessPattern) => p.size > 1024 * 1024) // Files larger than 1MB
			.sort((a: AccessPattern, b: AccessPattern) => b.size - a.size)
			.slice(0, 10)

		if (largeFiles.length > 0) {
			recommendations.push(`Top large files: ${largeFiles.map((f: AccessPattern) => `${f.file} (${this.formatBytes(f.size)})`).join(', ')}`)
		}

		// Access pattern recommendations
		const neverAccessedFiles = stats.accessPatterns.filter((p: AccessPattern) => p.accessCount === 1)
		if (neverAccessedFiles.length > 0) {
			const totalNeverAccessedSize = neverAccessedFiles.reduce((sum: number, f: AccessPattern) => sum + f.size, 0)
			recommendations.push(`${neverAccessedFiles.length} files accessed only once (${this.formatBytes(totalNeverAccessedSize)})`)
		}

		return recommendations
	}

	private formatBytes(bytes: number): string {
		const units = ['B', 'KB', 'MB', 'GB']
		let size = bytes
		let unitIndex = 0

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024
			unitIndex++
		}

		return `${size.toFixed(1)} ${units[unitIndex]}`
	}
}
