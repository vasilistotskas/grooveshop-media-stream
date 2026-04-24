import type { Metadata } from '#microservice/common/types/common.types'
import * as process from 'node:process'
import { requestContextStorage } from '../async-local-storage.js'

import { CorrelatedLogger } from './logger.util.js'

export interface PerformancePhase {
	name: string
	startTime: bigint
	endTime?: bigint
	duration?: number
	metadata?: Metadata
}

export class PerformanceTracker {
	private static readonly MAX_TRACKED_REQUESTS = 1000
	private static readonly MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes
	private static phases = new Map<string, PerformancePhase[]>()
	private static timestamps = new Map<string, number>()

	private static getCorrelationId(): string | null {
		const store = requestContextStorage.getStore()
		return store?.correlationId || null
	}

	/**
	 * Start tracking a performance phase
	 */
	static startPhase(phaseName: string, metadata?: Metadata): void {
		const correlationId = this.getCorrelationId()
		if (!correlationId)
			return

		const phase: PerformancePhase = {
			name: phaseName,
			startTime: process.hrtime.bigint(),
			metadata,
		}

		if (!this.phases.has(correlationId)) {
			// Evict stale entries (older than MAX_AGE_MS) and oldest if map is too large
			const now = Date.now()
			if (this.phases.size >= this.MAX_TRACKED_REQUESTS) {
				for (const [key, ts] of this.timestamps) {
					if (now - ts > this.MAX_AGE_MS) {
						this.phases.delete(key)
						this.timestamps.delete(key)
					}
				}
				// If still too large after TTL eviction, drop oldest
				if (this.phases.size >= this.MAX_TRACKED_REQUESTS) {
					const firstKey = this.phases.keys().next().value
					if (firstKey) {
						this.phases.delete(firstKey)
						this.timestamps.delete(firstKey)
					}
				}
			}
			this.phases.set(correlationId, [])
			this.timestamps.set(correlationId, now)
		}

		this.phases.get(correlationId)!.push(phase)

		CorrelatedLogger.debug(
			`Performance phase started: ${phaseName}${metadata ? ` (${JSON.stringify(metadata)})` : ''}`,
			'PerformanceTracker',
		)
	}

	/**
	 * End tracking a performance phase
	 */
	static endPhase(phaseName: string, metadata?: Metadata): number | null {
		const correlationId = this.getCorrelationId()
		if (!correlationId)
			return null

		const phases = this.phases.get(correlationId)
		if (!phases)
			return null

		// Find last uncompleted phase with this name — backward loop avoids array copy
		let phase: PerformancePhase | undefined
		for (let i = phases.length - 1; i >= 0; i--) {
			if (phases[i].name === phaseName && !phases[i].endTime) {
				phase = phases[i]
				break
			}
		}

		if (!phase) {
			CorrelatedLogger.warn(
				`Performance phase not found or already ended: ${phaseName}`,
				'PerformanceTracker',
			)
			return null
		}

		phase.endTime = process.hrtime.bigint()
		phase.duration = Number(phase.endTime - phase.startTime) / 1_000_000

		if (metadata) {
			phase.metadata = { ...phase.metadata, ...metadata }
		}

		const message = `Performance phase completed: ${phaseName} - ${phase.duration.toFixed(2)}ms${phase.metadata ? ` (${JSON.stringify(phase.metadata)})` : ''}`

		if (phase.duration > 1000) {
			CorrelatedLogger.warn(message, 'PerformanceTracker')
		}
		else {
			CorrelatedLogger.debug(message, 'PerformanceTracker')
		}

		return phase.duration
	}

	/**
	 * Get all performance phases for the current request
	 */
	static getPhases(): PerformancePhase[] {
		const correlationId = this.getCorrelationId()
		if (!correlationId)
			return []

		return this.phases.get(correlationId) || []
	}

	/**
	 * Get performance summary for the current request
	 */
	static getSummary(): {
		totalPhases: number
		completedPhases: number
		totalDuration: number
		slowestPhase?: PerformancePhase
		phases: PerformancePhase[]
	} {
		const phases = this.getPhases()
		const completedPhases = phases.filter(p => p.duration !== undefined)
		const totalDuration = completedPhases.reduce((sum: any, p: any) => sum + (p.duration || 0), 0)
		const slowestPhase = completedPhases.reduce((slowest: any, current: any) =>
			!slowest || (current.duration || 0) > (slowest.duration || 0) ? current : slowest, undefined as PerformancePhase | undefined)

		return {
			totalPhases: phases.length,
			completedPhases: completedPhases.length,
			totalDuration,
			slowestPhase,
			phases,
		}
	}

	/**
	 * Clean up tracking data for a request
	 * effectively preventing memory leaks
	 */
	static cleanup(correlationId?: string): void {
		const id = correlationId || this.getCorrelationId()
		if (id) {
			this.phases.delete(id)
			this.timestamps.delete(id)
		}
	}

	/**
	 * Measure the execution time of a function
	 */
	static async measure<T>(
		phaseName: string,
		fn: () => Promise<T> | T,
		metadata?: Metadata,
	): Promise<T> {
		this.startPhase(phaseName, metadata)
		try {
			const result = await fn()
			this.endPhase(phaseName, { success: true })
			return result
		}
		catch (error: unknown) {
			this.endPhase(phaseName, {
				success: false,
				error: error instanceof Error ? (error as Error).message : 'Unknown error',
			})
			throw error
		}
	}

	/**
	 * Create a decorator for measuring method execution time
	 */
	static measureMethod(phaseName?: string, metadata?: Metadata) {
		return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
			const method = descriptor.value
			const actualPhaseName = phaseName || `${target.constructor.name}.${propertyName}`

			descriptor.value = async function (...args: any[]) {
				return PerformanceTracker.measure(
					actualPhaseName,
					() => method.apply(this, args),
					metadata,
				)
			}
		}
	}

	/**
	 * Log performance summary at the end of a request
	 */
	static logSummary(): void {
		const summary = this.getSummary()
		if (summary.totalPhases === 0)
			return

		const store = requestContextStorage.getStore()
		const requestDuration = store?.duration

		CorrelatedLogger.log(
			`Performance Summary: ${summary.completedPhases}/${summary.totalPhases} phases completed, `
			+ `total phase time: ${summary.totalDuration.toFixed(2)}ms${requestDuration ? `, request time: ${requestDuration.toFixed(2)}ms` : ''
			}${summary.slowestPhase ? `, slowest: ${summary.slowestPhase.name} (${summary.slowestPhase.duration?.toFixed(2)}ms)` : ''}`,
			'PerformanceTracker',
		)

		this.cleanup()
	}
}
