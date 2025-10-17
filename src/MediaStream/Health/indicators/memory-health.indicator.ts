import type { HealthIndicatorResult } from '@nestjs/terminus'
import type { HealthCheckOptions } from '../interfaces/health-indicator.interface.js'
import * as os from 'node:os'
import * as process from 'node:process'
import { Injectable } from '@nestjs/common'
import { BaseHealthIndicator } from '../base/base-health-indicator.js'

export interface MemoryInfo {
	totalMemory: number
	freeMemory: number
	usedMemory: number
	memoryUsagePercentage: number
	processMemory: NodeJS.MemoryUsage
	heapUsagePercentage: number
}

@Injectable()
export class MemoryHealthIndicator extends BaseHealthIndicator {
	private readonly _warningThreshold: number
	private readonly _criticalThreshold: number
	private readonly heapWarningThreshold: number
	private readonly heapCriticalThreshold: number

	constructor() {
		const options: HealthCheckOptions = {
			timeout: 1000,
			threshold: 0.95,
		}

		super('memory', options)

		this._warningThreshold = 0.85
		this._criticalThreshold = 0.95
		this.heapWarningThreshold = 0.90
		this.heapCriticalThreshold = 0.98
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		return this.executeWithTimeout(async () => {
			const memoryInfo = this.getMemoryInfo()

			if (memoryInfo.memoryUsagePercentage >= this._criticalThreshold) {
				return this.createUnhealthyResult(
					`System memory critically high: ${(memoryInfo.memoryUsagePercentage * 100).toFixed(1)}% used`,
					memoryInfo,
				)
			}

			if (memoryInfo.heapUsagePercentage >= this.heapCriticalThreshold) {
				return this.createUnhealthyResult(
					`Heap memory critically high: ${(memoryInfo.heapUsagePercentage * 100).toFixed(1)}% used`,
					memoryInfo,
				)
			}

			let detailStatus = 'healthy'
			if (memoryInfo.memoryUsagePercentage >= this._warningThreshold
				|| memoryInfo.heapUsagePercentage >= this.heapWarningThreshold) {
				detailStatus = 'warning'
			}

			return this.createHealthyResult({
				...memoryInfo,
				detailStatus,
				thresholds: {
					systemMemoryWarning: this._warningThreshold,
					systemMemoryCritical: this._criticalThreshold,
					heapMemoryWarning: this.heapWarningThreshold,
					heapMemoryCritical: this.heapCriticalThreshold,
				},
			})
		})
	}

	protected getDescription(): string {
		return 'Monitors system and process memory usage'
	}

	private getMemoryInfo(): MemoryInfo {
		const totalMemory = os.totalmem()
		const freeMemory = os.freemem()
		const usedMemory = totalMemory - freeMemory
		const memoryUsagePercentage = usedMemory / totalMemory

		const processMemory = process.memoryUsage()
		const heapUsagePercentage = processMemory.heapUsed / processMemory.rss

		return {
			totalMemory: this.formatBytes(totalMemory),
			freeMemory: this.formatBytes(freeMemory),
			usedMemory: this.formatBytes(usedMemory),
			memoryUsagePercentage,
			processMemory: {
				rss: this.formatBytes(processMemory.rss),
				heapTotal: this.formatBytes(processMemory.heapTotal),
				heapUsed: this.formatBytes(processMemory.heapUsed),
				external: this.formatBytes(processMemory.external),
				arrayBuffers: this.formatBytes(processMemory.arrayBuffers),
			},
			heapUsagePercentage,
		}
	}

	private formatBytes(bytes: number): number {
		return Math.round(bytes / (1024 * 1024))
	}

	/**
	 * Get current memory information without health check wrapper
	 */
	getCurrentMemoryInfo(): MemoryInfo {
		return this.getMemoryInfo()
	}

	/**
	 * Force garbage collection if available (for testing/debugging)
	 */
	forceGarbageCollection(): boolean {
		if (globalThis.gc) {
			globalThis.gc()
			return true
		}
		return false
	}
}
