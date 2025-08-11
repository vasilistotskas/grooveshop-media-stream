import { promises as fs, Stats } from 'node:fs'
import { extname, join } from 'node:path'
import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

export interface StorageStats {
	totalFiles: number
	totalSize: number
	averageFileSize: number
	oldestFile: Date | null
	newestFile: Date | null
	fileTypes: Record<string, number>
	accessPatterns: AccessPattern[]
}

export interface AccessPattern {
	file: string
	lastAccessed: Date
	accessCount: number
	size: number
	extension: string
}

export interface StorageThresholds {
	warningSize: number
	criticalSize: number
	warningFileCount: number
	criticalFileCount: number
	maxFileAge: number // in days
}

@Injectable()
export class StorageMonitoringService implements OnModuleInit {
	private readonly _logger = new Logger(StorageMonitoringService.name)
	private readonly storageDirectory: string
	private readonly thresholds: StorageThresholds
	private accessPatterns = new Map<string, AccessPattern>()
	private lastScanTime: Date = new Date()

	constructor(private readonly _configService: ConfigService) {
		this.storageDirectory = this._configService.getOptional('cache.file.directory', './storage')
		this.thresholds = {
			warningSize: this._configService.getOptional('storage.warningSize', 800 * 1024 * 1024), // 800MB
			criticalSize: this._configService.getOptional('storage.criticalSize', 1024 * 1024 * 1024), // 1GB
			warningFileCount: this._configService.getOptional('storage.warningFileCount', 5000),
			criticalFileCount: this._configService.getOptional('storage.criticalFileCount', 10000),
			maxFileAge: this._configService.getOptional('storage.maxFileAge', 30), // 30 days
		}
	}

	async onModuleInit(): Promise<void> {
		await this.ensureStorageDirectory()
		await this.scanStorageDirectory()
		this._logger.log('Storage monitoring service initialized')
	}

	/**
	 * Get current storage statistics
	 */
	async getStorageStats(): Promise<StorageStats> {
		try {
			const files = await fs.readdir(this.storageDirectory)
			let totalSize = 0
			let processedFileCount = 0
			let oldestFile: Date | null = null as any
			let newestFile: Date | null = null as any
			const fileTypes: Record<string, number> = {}

			for (const file of files) {
				if (file === '.gitkeep')
					continue

				const filePath = join(this.storageDirectory, file)
				const stats = await fs.stat(filePath)

				totalSize += stats.size
				processedFileCount++

				// Track oldest and newest files
				if (!oldestFile || stats.mtime < oldestFile) {
					oldestFile = stats.mtime
				}
				if (!newestFile || stats.mtime > newestFile) {
					newestFile = stats.mtime
				}

				// Track file types
				const ext = extname(file).toLowerCase()
				fileTypes[ext] = (fileTypes[ext] || 0) + 1

				// Update access patterns
				this.updateAccessPattern(file, stats)
			}

			const averageFileSize = processedFileCount > 0 ? totalSize / processedFileCount : 0

			return {
				totalFiles: processedFileCount,
				totalSize,
				averageFileSize,
				oldestFile,
				newestFile,
				fileTypes,
				accessPatterns: Array.from(this.accessPatterns.values())
					.sort((a: any, b: any) => b.accessCount - a.accessCount)
					.slice(0, 100), // Top 100 most accessed files
			}
		}
		catch (error: unknown) {
			CorrelatedLogger.error(
				`Failed to get storage stats: ${(error as Error).message}`,
				(error as Error).stack,
				StorageMonitoringService.name,
			)
			throw error
		}
	}

	/**
	 * Check if storage exceeds thresholds
	 */
	async checkThresholds(): Promise<{
		status: 'healthy' | 'warning' | 'critical'
		issues: string[]
		stats: StorageStats
	}> {
		const stats = await this.getStorageStats()
		const issues: string[] = []
		let status: 'healthy' | 'warning' | 'critical' = 'healthy'

		// Check size thresholds
		if (stats.totalSize >= this.thresholds.criticalSize) {
			status = 'critical'
			issues.push(`Storage size critical: ${this.formatBytes(stats.totalSize)} / ${this.formatBytes(this.thresholds.criticalSize)}`)
		}
		else if (stats.totalSize >= this.thresholds.warningSize) {
			status = 'warning'
			issues.push(`Storage size warning: ${this.formatBytes(stats.totalSize)} / ${this.formatBytes(this.thresholds.warningSize)}`)
		}

		// Check file count thresholds
		if (stats.totalFiles >= this.thresholds.criticalFileCount) {
			status = 'critical'
			issues.push(`File count critical: ${stats.totalFiles} / ${this.thresholds.criticalFileCount}`)
		}
		else if (stats.totalFiles >= this.thresholds.warningFileCount) {
			if (status !== 'critical')
				status = 'warning'
			issues.push(`File count warning: ${stats.totalFiles} / ${this.thresholds.warningFileCount}`)
		}

		// Check for old files
		const maxAge = this.thresholds.maxFileAge * 24 * 60 * 60 * 1000 // Convert days to milliseconds
		const cutoffDate = new Date(Date.now() - maxAge)
		const oldFiles = stats.accessPatterns.filter(pattern => pattern.lastAccessed < cutoffDate)

		if (oldFiles.length > 0) {
			if (status !== 'critical')
				status = 'warning'
			issues.push(`${oldFiles.length} files older than ${this.thresholds.maxFileAge} days`)
		}

		return { status, issues, stats }
	}

	/**
	 * Get files recommended for eviction based on access patterns
	 */
	async getEvictionCandidates(targetSize?: number): Promise<AccessPattern[]> {
		const stats = await this.getStorageStats()

		// If no target size specified, aim to free 20% of current storage
		const defaultTarget = Math.floor(stats.totalSize * 0.2)
		const target = targetSize || defaultTarget

		// Sort by access score (combination of access count and recency)
		const candidates = stats.accessPatterns
			.map(pattern => ({
				...pattern,
				score: this.calculateEvictionScore(pattern),
			}))
			.sort((a: any, b: any) => a.score - b.score) // Lower score = better candidate for eviction

		// Select candidates until we reach target size
		const selected: AccessPattern[] = []
		let freedSize = 0

		for (const candidate of candidates) {
			selected.push(candidate)
			freedSize += candidate.size

			if (freedSize >= target) {
				break
			}
		}

		return selected
	}

	/**
	 * Record file access for tracking patterns
	 */
	recordFileAccess(filename: string): void {
		const pattern = this.accessPatterns.get(filename)
		if (pattern) {
			pattern.accessCount++
			pattern.lastAccessed = new Date()
		}
		// If file not in patterns, it will be added during next scan
	}

	/**
	 * Scan storage directory and update access patterns
	 */
	@Cron(CronExpression.EVERY_HOUR)
	async scanStorageDirectory(): Promise<void> {
		try {
			CorrelatedLogger.debug('Starting storage directory scan', StorageMonitoringService.name)

			const files = await fs.readdir(this.storageDirectory)
			const currentFiles = new Set<string>()

			for (const file of files) {
				if (file === '.gitkeep')
					continue

				currentFiles.add(file)
				const filePath = join(this.storageDirectory, file)
				const stats = await fs.stat(filePath)

				this.updateAccessPattern(file, stats)
			}

			// Remove patterns for files that no longer exist
			for (const [filename] of this.accessPatterns) {
				if (!currentFiles.has(filename)) {
					this.accessPatterns.delete(filename)
				}
			}

			this.lastScanTime = new Date()
			CorrelatedLogger.debug(
				`Storage scan completed. Tracking ${this.accessPatterns.size} files`,
				StorageMonitoringService.name,
			)
		}
		catch (error: unknown) {
			CorrelatedLogger.error(
				`Storage directory scan failed: ${(error as Error).message}`,
				(error as Error).stack,
				StorageMonitoringService.name,
			)
		}
	}

	/**
	 * Get the last scan time
	 */
	getLastScanTime(): Date {
		return this.lastScanTime
	}

	private updateAccessPattern(filename: string, stats: Stats): void {
		const existing = this.accessPatterns.get(filename)

		if (existing) {
			// Update existing pattern
			existing.size = stats.size
			// Don't update lastAccessed from file stats as it's less accurate than our tracking
		}
		else {
			// Create new pattern
			this.accessPatterns.set(filename, {
				file: filename,
				lastAccessed: stats.atime,
				accessCount: 1, // Default to 1 for new files
				size: stats.size,
				extension: extname(filename).toLowerCase(),
			})
		}
	}

	private calculateEvictionScore(pattern: AccessPattern): number {
		const now = Date.now()
		const ageInDays = (now - pattern.lastAccessed.getTime()) / (1000 * 60 * 60 * 24)
		const sizeWeight = pattern.size / (1024 * 1024) // Size in MB

		// Lower score = better candidate for eviction
		// Factors: age (higher is worse), access count (lower is worse), size (larger files get slight penalty)
		const ageScore = Math.min(ageInDays * 10, 1000) // Cap age score at 1000
		const accessScore = Math.max(1000 - (pattern.accessCount * 10), 0) // More accesses = lower score
		const sizeScore = Math.min(sizeWeight, 100) // Cap size penalty at 100

		return ageScore + accessScore + sizeScore
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

	private async ensureStorageDirectory(): Promise<void> {
		try {
			await fs.mkdir(this.storageDirectory, { recursive: true })
		}
		catch (error: unknown) {
			CorrelatedLogger.error(
				`Failed to create storage directory: ${(error as Error).message}`,
				(error as Error).stack,
				StorageMonitoringService.name,
			)
			throw error
		}
	}
}
