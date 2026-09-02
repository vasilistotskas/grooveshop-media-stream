import type { HealthIndicatorResult } from '@nestjs/terminus'
import * as os from 'node:os'
import * as process from 'node:process'
import * as v8 from 'node:v8'
import { Injectable } from '@nestjs/common'
import { bytesToMb } from '#microservice/common/utils/bytes.util'
import { BaseHealthIndicator } from '../base/base-health-indicator.js'

const TIMEOUT_MS = 1000
const SYSTEM_MEMORY_WARNING_RATIO = 0.85
const SYSTEM_MEMORY_CRITICAL_RATIO = 0.95
const HEAP_WARNING_RATIO = 0.90
/**
 * Shared with the /health/live probe: heapUsed against V8's actual ceiling
 * (`heap_size_limit`), not heapTotal, which V8 grows lazily during normal GC
 * churn. At 0.98 the indicator could never fire before kubelet restarts the pod.
 */
export const HEAP_CRITICAL_RATIO = 0.95

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
	constructor() {
		super('memory', TIMEOUT_MS)
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		return this.executeWithTimeout(async () => {
			const memoryInfo = this.getMemoryInfo()

			if (memoryInfo.memoryUsagePercentage >= SYSTEM_MEMORY_CRITICAL_RATIO) {
				return this.createUnhealthyResult(
					`System memory critically high: ${(memoryInfo.memoryUsagePercentage * 100).toFixed(1)}% used`,
					memoryInfo,
				)
			}

			if (memoryInfo.heapUsagePercentage >= HEAP_CRITICAL_RATIO) {
				return this.createUnhealthyResult(
					`Heap memory critically high: ${(memoryInfo.heapUsagePercentage * 100).toFixed(1)}% of the V8 heap limit used`,
					memoryInfo,
				)
			}

			const detailStatus = memoryInfo.memoryUsagePercentage >= SYSTEM_MEMORY_WARNING_RATIO || memoryInfo.heapUsagePercentage >= HEAP_WARNING_RATIO
				? 'warning'
				: 'healthy'

			return this.createHealthyResult({
				...memoryInfo,
				detailStatus,
				thresholds: {
					systemMemoryWarning: SYSTEM_MEMORY_WARNING_RATIO,
					systemMemoryCritical: SYSTEM_MEMORY_CRITICAL_RATIO,
					heapMemoryWarning: HEAP_WARNING_RATIO,
					heapMemoryCritical: HEAP_CRITICAL_RATIO,
				},
			})
		})
	}

	protected getDescription(): string {
		return 'Monitors system and process memory usage'
	}

	/** Sizes in whole megabytes; percentages as 0–1 ratios. */
	getCurrentMemoryInfo(): MemoryInfo {
		return this.getMemoryInfo()
	}

	private getMemoryInfo(): MemoryInfo {
		const totalMemory = os.totalmem()
		const freeMemory = os.freemem()
		const usedMemory = totalMemory - freeMemory

		const processMemory = process.memoryUsage()
		const heapLimit = v8.getHeapStatistics().heap_size_limit

		return {
			totalMemory: bytesToMb(totalMemory),
			freeMemory: bytesToMb(freeMemory),
			usedMemory: bytesToMb(usedMemory),
			memoryUsagePercentage: usedMemory / totalMemory,
			processMemory: {
				rss: bytesToMb(processMemory.rss),
				heapTotal: bytesToMb(processMemory.heapTotal),
				heapUsed: bytesToMb(processMemory.heapUsed),
				external: bytesToMb(processMemory.external),
				arrayBuffers: bytesToMb(processMemory.arrayBuffers),
			},
			heapUsagePercentage: processMemory.heapUsed / heapLimit,
		}
	}
}
