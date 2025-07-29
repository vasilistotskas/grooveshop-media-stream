import { promises as fs, Stats } from 'node:fs'
import { join } from 'node:path'
import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { IntelligentEvictionService } from './intelligent-eviction.service'
import { StorageMonitoringService } from './storage-monitoring.service'

export interface RetentionPolicy {
	name: string
	description: string
	maxAge: number // in days
	maxSize: number // in bytes
	filePattern?: RegExp
	preserveCount?: number // minimum files to keep
	enabled: boolean
}

export interface CleanupResult {
	filesRemoved: number
	sizeFreed: number
	errors: string[]
	policiesApplied: string[]
	duration: number
	nextCleanup: Date
}

export interface CleanupConfig {
	enabled: boolean
	cronSchedule: string
	policies: RetentionPolicy[]
	dryRun: boolean
	maxCleanupDuration: number // in milliseconds
}

@Injectable()
export class StorageCleanupService implements OnModuleInit {
	private readonly logger = new Logger(StorageCleanupService.name)
	private readonly storageDirectory: string
	private readonly config: CleanupConfig
	private lastCleanup: Date = new Date()
	private isCleanupRunning = false

	constructor(
		private readonly configService: ConfigService,
		private readonly storageMonitoring: StorageMonitoringService,
		private readonly intelligentEviction: IntelligentEvictionService,
	) {
		this.storageDirectory = this.configService.getOptional('cache.file.directory', './storage')
		this.config = this.loadCleanupConfig()
	}

	async onModuleInit(): Promise<void> {
		if (this.config.enabled) {
			this.logger.log('Storage cleanup service initialized with policies:', this.config.policies.map(p => p.name))
		}
		else {
			this.logger.log('Storage cleanup service disabled')
		}
	}

	/**
	 * Perform manual cleanup with optional policy override
	 */
	async performCleanup(policyNames?: string[], dryRun?: boolean): Promise<CleanupResult> {
		if (this.isCleanupRunning) {
			throw new Error('Cleanup is already running')
		}

		const startTime = Date.now()
		this.isCleanupRunning = true

		try {
			CorrelatedLogger.log('Starting storage cleanup', StorageCleanupService.name)

			const policiesToApply = policyNames
				? this.config.policies.filter(p => policyNames.includes(p.name))
				: this.config.policies.filter(p => p.enabled)

			const isDryRun = dryRun ?? this.config.dryRun

			let totalFilesRemoved = 0
			let totalSizeFreed = 0
			const allErrors: string[] = []
			const appliedPolicies: string[] = []

			// Apply each retention policy
			for (const policy of policiesToApply) {
				try {
					const result = await this.applyRetentionPolicy(policy, isDryRun)
					totalFilesRemoved += result.filesRemoved
					totalSizeFreed += result.sizeFreed
					allErrors.push(...result.errors)
					appliedPolicies.push(policy.name)

					CorrelatedLogger.debug(
						`Policy '${policy.name}': ${result.filesRemoved} files, ${this.formatBytes(result.sizeFreed)} freed`,
						StorageCleanupService.name,
					)
				}
				catch (error) {
					const errorMsg = `Policy '${policy.name}' failed: ${error.message}`
					allErrors.push(errorMsg)
					CorrelatedLogger.error(errorMsg, error.stack, StorageCleanupService.name)
				}
			}

			// Check if we need intelligent eviction after policy cleanup
			const thresholdCheck = await this.storageMonitoring.checkThresholds()
			if (thresholdCheck.status !== 'healthy' && !isDryRun) {
				try {
					const evictionResult = await this.intelligentEviction.performThresholdBasedEviction()
					totalFilesRemoved += evictionResult.filesEvicted
					totalSizeFreed += evictionResult.sizeFreed
					allErrors.push(...evictionResult.errors)
					appliedPolicies.push('intelligent-eviction')
				}
				catch (error) {
					allErrors.push(`Intelligent eviction failed: ${error.message}`)
				}
			}

			this.lastCleanup = new Date()
			const duration = Date.now() - startTime

			const result: CleanupResult = {
				filesRemoved: totalFilesRemoved,
				sizeFreed: totalSizeFreed,
				errors: allErrors,
				policiesApplied: appliedPolicies,
				duration,
				nextCleanup: this.getNextCleanupTime(),
			}

			CorrelatedLogger.log(
				`Cleanup completed: ${totalFilesRemoved} files removed, ${this.formatBytes(totalSizeFreed)} freed`,
				StorageCleanupService.name,
			)

			return result
		}
		finally {
			this.isCleanupRunning = false
		}
	}

	/**
	 * Scheduled cleanup based on cron configuration
	 */
	@Cron('0 2 * * *') // Default: 2 AM daily
	async scheduledCleanup(): Promise<void> {
		// Check current enabled status (not cached config)
		const currentlyEnabled = this.configService.getOptional('storage.cleanup.enabled', true)
		if (!currentlyEnabled || this.isCleanupRunning) {
			return
		}

		try {
			await this.performCleanup()
		}
		catch (error) {
			CorrelatedLogger.error(
				`Scheduled cleanup failed: ${error.message}`,
				error.stack,
				StorageCleanupService.name,
			)
		}
	}

	/**
	 * Get cleanup status and next scheduled run
	 */
	getCleanupStatus(): {
		enabled: boolean
		isRunning: boolean
		lastCleanup: Date
		nextCleanup: Date
		policies: RetentionPolicy[]
	} {
		return {
			enabled: this.config.enabled,
			isRunning: this.isCleanupRunning,
			lastCleanup: this.lastCleanup,
			nextCleanup: this.getNextCleanupTime(),
			policies: this.config.policies,
		}
	}

	/**
	 * Add or update a retention policy
	 */
	updateRetentionPolicy(policy: RetentionPolicy): void {
		const existingIndex = this.config.policies.findIndex(p => p.name === policy.name)

		if (existingIndex >= 0) {
			this.config.policies[existingIndex] = policy
		}
		else {
			this.config.policies.push(policy)
		}

		CorrelatedLogger.log(`Retention policy '${policy.name}' updated`, StorageCleanupService.name)
	}

	/**
	 * Remove a retention policy
	 */
	removeRetentionPolicy(policyName: string): boolean {
		const index = this.config.policies.findIndex(p => p.name === policyName)

		if (index >= 0) {
			this.config.policies.splice(index, 1)
			CorrelatedLogger.log(`Retention policy '${policyName}' removed`, StorageCleanupService.name)
			return true
		}

		return false
	}

	private async applyRetentionPolicy(policy: RetentionPolicy, dryRun: boolean): Promise<{
		filesRemoved: number
		sizeFreed: number
		errors: string[]
	}> {
		const files = await fs.readdir(this.storageDirectory)
		const candidates: Array<{ file: string, stats: Stats }> = []

		// Collect candidate files
		for (const file of files) {
			if (file === '.gitkeep')
				continue

			const filePath = join(this.storageDirectory, file)
			const stats = await fs.stat(filePath)

			// Apply file pattern filter if specified
			if (policy.filePattern && !policy.filePattern.test(file)) {
				continue
			}

			// Check age criteria
			const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24)
			if (ageInDays < policy.maxAge) {
				continue
			}

			candidates.push({ file, stats })
		}

		// Sort by modification time (oldest first)
		candidates.sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime())

		// Apply preserve count if specified
		if (policy.preserveCount && candidates.length <= policy.preserveCount) {
			return { filesRemoved: 0, sizeFreed: 0, errors: [] }
		}

		const filesToRemove = policy.preserveCount
			? candidates.slice(0, candidates.length - policy.preserveCount)
			: candidates

		// Apply size limit
		let totalSize = 0
		const finalCandidates: Array<{ file: string, stats: Stats }> = []

		for (const candidate of filesToRemove) {
			if (policy.maxSize > 0 && totalSize + candidate.stats.size > policy.maxSize) {
				break
			}
			finalCandidates.push(candidate)
			totalSize += candidate.stats.size
		}

		// Remove files
		let filesRemoved = 0
		let sizeFreed = 0
		const errors: string[] = []

		for (const { file, stats } of finalCandidates) {
			try {
				if (!dryRun) {
					const filePath = join(this.storageDirectory, file)
					await fs.unlink(filePath)
				}

				filesRemoved++
				sizeFreed += stats.size

				CorrelatedLogger.debug(
					`${dryRun ? '[DRY RUN] ' : ''}Removed file: ${file} (${this.formatBytes(stats.size)})`,
					StorageCleanupService.name,
				)
			}
			catch (error) {
				const errorMsg = `Failed to remove ${file}: ${error.message}`
				errors.push(errorMsg)
				CorrelatedLogger.warn(errorMsg, StorageCleanupService.name)
			}
		}

		return { filesRemoved, sizeFreed, errors }
	}

	private loadCleanupConfig(): CleanupConfig {
		const enabled = this.configService.getOptional('storage.cleanup.enabled', true)
		const cronSchedule = this.configService.getOptional('storage.cleanup.cronSchedule', '0 2 * * *')
		const dryRun = this.configService.getOptional('storage.cleanup.dryRun', false)
		const maxCleanupDuration = this.configService.getOptional('storage.cleanup.maxDuration', 300000) // 5 minutes

		// Default retention policies
		const defaultPolicies: RetentionPolicy[] = [
			{
				name: 'old-cache-files',
				description: 'Remove cache files older than 30 days',
				maxAge: 30,
				maxSize: 0, // No size limit
				filePattern: /\.(json|cache)$/,
				enabled: true,
			},
			{
				name: 'large-images',
				description: 'Remove large image files older than 7 days',
				maxAge: 7,
				maxSize: 100 * 1024 * 1024, // 100MB total
				filePattern: /\.(jpg|jpeg|png|webp|gif)$/,
				enabled: true,
			},
			{
				name: 'temp-files',
				description: 'Remove temporary files older than 1 day',
				maxAge: 1,
				maxSize: 0,
				filePattern: /\.(tmp|temp)$/,
				enabled: true,
			},
			{
				name: 'preserve-recent',
				description: 'Keep at least 100 most recent files',
				maxAge: 0, // No age limit
				maxSize: 0,
				preserveCount: 100,
				enabled: true,
			},
		]

		return {
			enabled,
			cronSchedule,
			policies: defaultPolicies,
			dryRun,
			maxCleanupDuration,
		}
	}

	private getNextCleanupTime(): Date {
		// Simple calculation - in a real implementation, you'd parse the cron schedule
		const nextCleanup = new Date(this.lastCleanup)
		nextCleanup.setDate(nextCleanup.getDate() + 1) // Daily cleanup
		nextCleanup.setHours(2, 0, 0, 0) // 2 AM

		return nextCleanup
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
