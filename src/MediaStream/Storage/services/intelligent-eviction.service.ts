import type { AccessPattern } from './storage-monitoring.service'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ConfigService } from '@microservice/Config/config.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'
import { Injectable } from '@nestjs/common'
import { StorageMonitoringService } from './storage-monitoring.service'

export interface EvictionStrategy {
	name: string
	description: string
	execute: (candidates: AccessPattern[], targetSize: number) => Promise<AccessPattern[]>
}

export interface EvictionResult {
	filesEvicted: number
	sizeFreed: number
	errors: string[]
	strategy: string
	duration: number
}

export interface EvictionConfig {
	strategy: 'lru' | 'lfu' | 'size-based' | 'age-based' | 'intelligent'
	aggressiveness: 'conservative' | 'moderate' | 'aggressive'
	preservePopular: boolean
	minAccessCount: number
	maxFileAge: number
}

@Injectable()
export class IntelligentEvictionService {
	private readonly storageDirectory: string
	private readonly config: EvictionConfig
	private readonly strategies = new Map<string, EvictionStrategy>()

	constructor(
		private readonly _configService: ConfigService,
		private readonly storageMonitoring: StorageMonitoringService,
	) {
		this.storageDirectory = this._configService.getOptional('cache.file.directory', './storage')
		this.config = {
			strategy: this._configService.getOptional('storage.eviction.strategy', 'intelligent'),
			aggressiveness: this._configService.getOptional('storage.eviction.aggressiveness', 'moderate'),
			preservePopular: this._configService.getOptional('storage.eviction.preservePopular', true),
			minAccessCount: this._configService.getOptional('storage.eviction.minAccessCount', 5),
			maxFileAge: this._configService.getOptional('storage.eviction.maxFileAge', 7),
		}

		this.initializeStrategies()
	}

	/**
	 * Perform intelligent cache eviction based on access patterns
	 */
	async performEviction(targetSize?: number): Promise<EvictionResult> {
		const startTime = Date.now()

		try {
			CorrelatedLogger.debug(
				`Starting intelligent eviction with strategy: ${this.config.strategy}`,
				IntelligentEvictionService.name,
			)

			await this.storageMonitoring.getStorageStats()
			const candidates = await this.storageMonitoring.getEvictionCandidates(targetSize)

			if (candidates.length === 0) {
				return {
					filesEvicted: 0,
					sizeFreed: 0,
					errors: [],
					strategy: this.config.strategy,
					duration: Date.now() - startTime,
				}
			}

			const strategy = this.strategies.get(this.config.strategy)
			if (!strategy) {
				throw new Error(`Unknown eviction strategy: ${this.config.strategy}`)
			}

			const finalCandidates = await strategy.execute(candidates, targetSize || 0)

			const result = await this.evictFiles(finalCandidates)
			result.strategy = this.config.strategy
			result.duration = Date.now() - startTime

			CorrelatedLogger.log(
				`Eviction completed: ${result.filesEvicted} files, ${this.formatBytes(result.sizeFreed)} freed`,
				IntelligentEvictionService.name,
			)

			return result
		}
		catch (error: unknown) {
			CorrelatedLogger.error(
				`Eviction failed: ${(error as Error).message}`,
				(error as Error).stack,
				IntelligentEvictionService.name,
			)

			return {
				filesEvicted: 0,
				sizeFreed: 0,
				errors: [(error as Error).message],
				strategy: this.config.strategy,
				duration: Date.now() - startTime,
			}
		}
	}

	/**
	 * Perform eviction based on storage thresholds
	 */
	async performThresholdBasedEviction(): Promise<EvictionResult> {
		const thresholdCheck = await this.storageMonitoring.checkThresholds()

		if (thresholdCheck.status === 'healthy') {
			return {
				filesEvicted: 0,
				sizeFreed: 0,
				errors: [],
				strategy: 'threshold-based',
				duration: 0,
			}
		}

		let targetReduction: number

		if (thresholdCheck.status === 'critical') {
			targetReduction = Math.floor(thresholdCheck.stats.totalSize * 0.4)
		}
		else {
			targetReduction = Math.floor(thresholdCheck.stats.totalSize * 0.2)
		}

		return this.performEviction(targetReduction)
	}

	/**
	 * Get eviction recommendations without executing
	 */
	async getEvictionRecommendations(targetSize?: number): Promise<{
		candidates: AccessPattern[]
		totalSize: number
		strategy: string
		reasoning: string[]
	}> {
		const candidates = await this.storageMonitoring.getEvictionCandidates(targetSize)
		const strategy = this.strategies.get(this.config.strategy)

		if (!strategy) {
			throw new Error(`Unknown eviction strategy: ${this.config.strategy}`)
		}

		const finalCandidates = await strategy.execute(candidates, targetSize || 0)
		const totalSize = finalCandidates.reduce((sum: any, candidate: any) => sum + candidate.size, 0)

		const reasoning = this.generateEvictionReasoning(finalCandidates)

		return {
			candidates: finalCandidates,
			totalSize,
			strategy: this.config.strategy,
			reasoning,
		}
	}

	private initializeStrategies(): void {
		this.strategies.set('lru', {
			name: 'LRU',
			description: 'Evict least recently used files',
			execute: async (candidates: AccessPattern[], targetSize: number) => {
				return candidates
					.sort((a: any, b: any) => a.lastAccessed.getTime() - b.lastAccessed.getTime())
					.slice(0, this.calculateFileCount(candidates, targetSize))
			},
		})

		this.strategies.set('lfu', {
			name: 'LFU',
			description: 'Evict least frequently used files',
			execute: async (candidates: AccessPattern[], targetSize: number) => {
				return candidates
					.sort((a: any, b: any) => a.accessCount - b.accessCount)
					.slice(0, this.calculateFileCount(candidates, targetSize))
			},
		})

		this.strategies.set('size-based', {
			name: 'Size-based',
			description: 'Evict largest files first',
			execute: async (candidates: AccessPattern[], targetSize: number) => {
				return candidates
					.sort((a: any, b: any) => b.size - a.size)
					.slice(0, this.calculateFileCount(candidates, targetSize))
			},
		})

		this.strategies.set('age-based', {
			name: 'Age-based',
			description: 'Evict oldest files first',
			execute: async (candidates: AccessPattern[], targetSize: number) => {
				const maxAge = this.config.maxFileAge * 24 * 60 * 60 * 1000
				const cutoffDate = new Date(Date.now() - maxAge)

				return candidates
					.filter(candidate => candidate.lastAccessed < cutoffDate)
					.sort((a: any, b: any) => a.lastAccessed.getTime() - b.lastAccessed.getTime())
					.slice(0, this.calculateFileCount(candidates, targetSize))
			},
		})

		this.strategies.set('intelligent', {
			name: 'Intelligent',
			description: 'Combines access patterns, size, and age for optimal eviction',
			execute: async (candidates: AccessPattern[], targetSize: number) => {
				let filtered = candidates
				if (this.config.preservePopular) {
					filtered = candidates.filter(candidate =>
						candidate.accessCount < this.config.minAccessCount,
					)
				}

				const aggressivenessMultiplier = this.getAggressivenessMultiplier()
				const adjustedTargetSize = targetSize * aggressivenessMultiplier

				return filtered.slice(0, this.calculateFileCount(filtered, adjustedTargetSize))
			},
		})
	}

	private async evictFiles(candidates: AccessPattern[]): Promise<EvictionResult> {
		let filesEvicted = 0
		let sizeFreed = 0
		const errors: string[] = []

		for (const candidate of candidates) {
			try {
				const filePath = join(this.storageDirectory, candidate.file)
				await fs.unlink(filePath)

				filesEvicted++
				sizeFreed += candidate.size

				CorrelatedLogger.debug(
					`Evicted file: ${candidate.file} (${this.formatBytes(candidate.size)})`,
					IntelligentEvictionService.name,
				)
			}
			catch (error: unknown) {
				const errorMsg = `Failed to evict ${candidate.file}: ${(error as Error).message}`
				errors.push(errorMsg)
				CorrelatedLogger.warn(errorMsg, IntelligentEvictionService.name)
			}
		}

		return {
			filesEvicted,
			sizeFreed,
			errors,
			strategy: '',
			duration: 0,
		}
	}

	private calculateFileCount(candidates: AccessPattern[], targetSize: number): number {
		if (targetSize <= 0)
			return candidates.length

		let currentSize = 0
		let count = 0

		for (const candidate of candidates) {
			currentSize += candidate.size
			count++

			if (currentSize >= targetSize) {
				break
			}
		}

		return count
	}

	private getAggressivenessMultiplier(): number {
		switch (this.config.aggressiveness) {
			case 'conservative':
				return 0.8
			case 'moderate':
				return 1.0
			case 'aggressive':
				return 1.5
			default:
				return 1.0
		}
	}

	private generateEvictionReasoning(candidates: AccessPattern[]): string[] {
		const reasoning: string[] = []

		if (candidates.length === 0) {
			reasoning.push('No files selected for eviction')
			return reasoning
		}

		const totalSize = candidates.reduce((sum: any, c: any) => sum + c.size, 0)
		const avgAccessCount = candidates.reduce((sum: any, c: any) => sum + c.accessCount, 0) / candidates.length
		const oldestAccess = Math.min(...candidates.map(c => c.lastAccessed.getTime()))
		const daysSinceOldest = (Date.now() - oldestAccess) / (1000 * 60 * 60 * 24)

		reasoning.push(`Selected ${candidates.length} files totaling ${this.formatBytes(totalSize)}`)
		reasoning.push(`Average access count: ${avgAccessCount.toFixed(1)}`)
		reasoning.push(`Oldest file last accessed ${daysSinceOldest.toFixed(1)} days ago`)

		if (this.config.preservePopular) {
			reasoning.push(`Popular files (>${this.config.minAccessCount} accesses) preserved`)
		}

		reasoning.push(`Strategy: ${this.config.strategy} (${this.config.aggressiveness})`)

		return reasoning
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
