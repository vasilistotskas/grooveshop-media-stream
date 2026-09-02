import * as process from 'node:process'
import { requestContextStorage } from '../async-local-storage.js'
import { CorrelatedLogger } from './logger.util.js'

interface PerformancePhase {
	name: string
	startTime: bigint
	endTime?: bigint
	duration?: number
}

const MAX_TRACKED_REQUESTS = 1000
const MAX_AGE_MS = 5 * 60 * 1000
/** Phases slower than this are logged at warn. */
const SLOW_PHASE_MS = 1000

/**
 * Per-request phase timings, keyed by the correlation id from
 * AsyncLocalStorage. TimingMiddleware logs and clears them when the
 * response ends; the caps below bound the map if a request never ends.
 */
export class PerformanceTracker {
	private static phases = new Map<string, PerformancePhase[]>()
	private static timestamps = new Map<string, number>()

	private static getCorrelationId(): string | null {
		return requestContextStorage.getStore()?.correlationId || null
	}

	static startPhase(phaseName: string): void {
		const correlationId = this.getCorrelationId()
		if (!correlationId)
			return

		if (!this.phases.has(correlationId)) {
			this.evictStale()
			this.phases.set(correlationId, [])
			this.timestamps.set(correlationId, Date.now())
		}

		this.phases.get(correlationId)!.push({ name: phaseName, startTime: process.hrtime.bigint() })

		CorrelatedLogger.debug(`Performance phase started: ${phaseName}`, PerformanceTracker.name)
	}

	/** Ends the most recent open phase with this name; returns its duration in ms. */
	static endPhase(phaseName: string): number | null {
		const correlationId = this.getCorrelationId()
		if (!correlationId)
			return null

		const phases = this.phases.get(correlationId)
		if (!phases)
			return null

		let phase: PerformancePhase | undefined
		for (let i = phases.length - 1; i >= 0; i--) {
			if (phases[i].name === phaseName && !phases[i].endTime) {
				phase = phases[i]
				break
			}
		}

		if (!phase) {
			CorrelatedLogger.warn(`Performance phase not found or already ended: ${phaseName}`, PerformanceTracker.name)
			return null
		}

		phase.endTime = process.hrtime.bigint()
		phase.duration = Number(phase.endTime - phase.startTime) / 1_000_000

		const message = `Performance phase completed: ${phaseName} - ${phase.duration.toFixed(2)}ms`
		if (phase.duration > SLOW_PHASE_MS) {
			CorrelatedLogger.warn(message, PerformanceTracker.name)
		}
		else {
			CorrelatedLogger.debug(message, PerformanceTracker.name)
		}

		return phase.duration
	}

	static getPhases(): PerformancePhase[] {
		const correlationId = this.getCorrelationId()
		return correlationId ? this.phases.get(correlationId) || [] : []
	}

	static getSummary(): {
		totalPhases: number
		completedPhases: number
		totalDuration: number
		slowestPhase?: PerformancePhase
		phases: PerformancePhase[]
	} {
		const phases = this.getPhases()
		const completedPhases = phases.filter(phase => phase.duration !== undefined)
		const totalDuration = completedPhases.reduce((sum, phase) => sum + (phase.duration ?? 0), 0)
		const slowestPhase = completedPhases.reduce<PerformancePhase | undefined>(
			(slowest, current) => !slowest || (current.duration ?? 0) > (slowest.duration ?? 0) ? current : slowest,
			undefined,
		)

		return {
			totalPhases: phases.length,
			completedPhases: completedPhases.length,
			totalDuration,
			slowestPhase,
			phases,
		}
	}

	static cleanup(correlationId?: string): void {
		const id = correlationId || this.getCorrelationId()
		if (id) {
			this.phases.delete(id)
			this.timestamps.delete(id)
		}
	}

	/**
	 * One debug line per request with the phase breakdown. Debug, not info:
	 * the default LOG_LEVEL exists so logs are not flooded with one entry per
	 * request; TimingMiddleware already escalates slow/failed requests.
	 */
	static logSummary(): void {
		const summary = this.getSummary()
		if (summary.totalPhases === 0)
			return

		const requestDuration = requestContextStorage.getStore()?.duration

		CorrelatedLogger.debug(
			`Performance Summary: ${summary.completedPhases}/${summary.totalPhases} phases completed, `
			+ `total phase time: ${summary.totalDuration.toFixed(2)}ms${requestDuration ? `, request time: ${requestDuration.toFixed(2)}ms` : ''}`
			+ `${summary.slowestPhase ? `, slowest: ${summary.slowestPhase.name} (${summary.slowestPhase.duration?.toFixed(2)}ms)` : ''}`,
			PerformanceTracker.name,
		)

		this.cleanup()
	}

	/** Drop requests older than MAX_AGE_MS, then the oldest one if still over the cap. */
	private static evictStale(): void {
		if (this.phases.size < MAX_TRACKED_REQUESTS)
			return

		const now = Date.now()
		for (const [key, timestamp] of this.timestamps) {
			if (now - timestamp > MAX_AGE_MS) {
				this.phases.delete(key)
				this.timestamps.delete(key)
			}
		}

		if (this.phases.size >= MAX_TRACKED_REQUESTS) {
			const oldest = this.phases.keys().next().value
			if (oldest) {
				this.phases.delete(oldest)
				this.timestamps.delete(oldest)
			}
		}
	}
}
