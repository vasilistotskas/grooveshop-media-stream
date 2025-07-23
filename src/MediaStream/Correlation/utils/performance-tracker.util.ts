import * as process from 'node:process'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { CorrelatedLogger } from '@microservice/Correlation/utils/logger.util'

export interface PerformancePhase {
	name: string
	startTime: bigint
	endTime?: bigint
	duration?: number
	metadata?: Record<string, any>
}

export class PerformanceTracker {
	private static phases = new Map<string, PerformancePhase[]>()

	private static getCorrelationService(): CorrelationService {
		// Create a new instance each time to avoid static context issues
		return new CorrelationService()
	}

	/**
	 * Start tracking a performance phase
	 */
	static startPhase(phaseName: string, metadata?: Record<string, any>): void {
		const correlationId = this.getCorrelationService().getCorrelationId()
		if (!correlationId)
			return

		const phase: PerformancePhase = {
			name: phaseName,
			startTime: process.hrtime.bigint(),
			metadata,
		}

		if (!this.phases.has(correlationId)) {
			this.phases.set(correlationId, [])
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
	static endPhase(phaseName: string, metadata?: Record<string, any>): number | null {
		const correlationId = this.getCorrelationService().getCorrelationId()
		if (!correlationId)
			return null

		const phases = this.phases.get(correlationId)
		if (!phases)
			return null

		// Find the most recent phase with this name that hasn't ended
		const phase = phases
			.slice()
			.reverse()
			.find(p => p.name === phaseName && !p.endTime)

		if (!phase) {
			CorrelatedLogger.warn(
				`Performance phase not found or already ended: ${phaseName}`,
				'PerformanceTracker',
			)
			return null
		}

		phase.endTime = process.hrtime.bigint()
		phase.duration = Number(phase.endTime - phase.startTime) / 1_000_000 // Convert to milliseconds

		if (metadata) {
			phase.metadata = { ...phase.metadata, ...metadata }
		}

		const logLevel = phase.duration > 1000 ? 'warn' : 'debug'
		const logger = logLevel === 'warn' ? CorrelatedLogger.warn : CorrelatedLogger.debug

		logger(
			`Performance phase completed: ${phaseName} - ${phase.duration.toFixed(2)}ms${
				phase.metadata ? ` (${JSON.stringify(phase.metadata)})` : ''
			}`,
			'PerformanceTracker',
		)

		return phase.duration
	}

	/**
	 * Get all performance phases for the current request
	 */
	static getPhases(): PerformancePhase[] {
		const correlationId = this.getCorrelationService().getCorrelationId()
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
		const totalDuration = completedPhases.reduce((sum, p) => sum + (p.duration || 0), 0)
		const slowestPhase = completedPhases.reduce((slowest, current) =>
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
	 * Clear performance data for the current request
	 */
	static clearPhases(): void {
		const correlationId = this.getCorrelationService().getCorrelationId()
		if (correlationId) {
			this.phases.delete(correlationId)
		}
	}

	/**
	 * Measure the execution time of a function
	 */
	static async measure<T>(
		phaseName: string,
		fn: () => Promise<T> | T,
		metadata?: Record<string, any>,
	): Promise<T> {
		this.startPhase(phaseName, metadata)
		try {
			const result = await fn()
			this.endPhase(phaseName, { success: true })
			return result
		}
		catch (error) {
			this.endPhase(phaseName, {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw error
		}
	}

	/**
	 * Create a decorator for measuring method execution time
	 */
	static measureMethod(phaseName?: string, metadata?: Record<string, any>) {
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

		const context = this.getCorrelationService().getContext()
		const requestDuration = context?.duration

		CorrelatedLogger.log(
			`Performance Summary: ${summary.completedPhases}/${summary.totalPhases} phases completed, `
			+ `total phase time: ${summary.totalDuration.toFixed(2)}ms${
				requestDuration ? `, request time: ${requestDuration.toFixed(2)}ms` : ''
			}${summary.slowestPhase ? `, slowest: ${summary.slowestPhase.name} (${summary.slowestPhase.duration?.toFixed(2)}ms)` : ''}`,
			'PerformanceTracker',
		)

		// Clear phases after logging
		this.clearPhases()
	}
}
