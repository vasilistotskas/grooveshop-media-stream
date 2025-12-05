/**
 * Request deduplication utility
 * Prevents duplicate processing of identical concurrent requests
 */

import { Logger } from '@nestjs/common'

export interface PendingRequest<T> {
	promise: Promise<T>
	timestamp: number
	refCount: number
}

export class RequestDeduplicator<T = void> {
	private readonly _logger = new Logger(RequestDeduplicator.name)
	private readonly pendingRequests = new Map<string, PendingRequest<T>>()
	private readonly maxPendingAge: number

	constructor(maxPendingAgeMs: number = 60000) {
		this.maxPendingAge = maxPendingAgeMs

		// Cleanup stale entries periodically
		setInterval(() => this.cleanupStaleEntries(), 30000)
	}

	/**
	 * Execute a function with deduplication
	 * If the same key is already being processed, wait for that result instead
	 */
	async execute(key: string, fn: () => Promise<T>): Promise<T> {
		// Check for existing pending request
		const existing = this.pendingRequests.get(key)
		if (existing) {
			existing.refCount++
			this._logger.debug(`Request deduplicated for key: ${key} (refs: ${existing.refCount})`)
			return existing.promise
		}

		// Create new pending request
		const promise = this.executeWithCleanup(key, fn)
		const pending: PendingRequest<T> = {
			promise,
			timestamp: Date.now(),
			refCount: 1,
		}

		this.pendingRequests.set(key, pending)
		this._logger.debug(`New request started for key: ${key}`)

		return promise
	}

	/**
	 * Check if a request is currently pending
	 */
	isPending(key: string): boolean {
		return this.pendingRequests.has(key)
	}

	/**
	 * Get the number of pending requests
	 */
	getPendingCount(): number {
		return this.pendingRequests.size
	}

	/**
	 * Get statistics about pending requests
	 */
	getStats(): { pending: number, keys: string[] } {
		return {
			pending: this.pendingRequests.size,
			keys: Array.from(this.pendingRequests.keys()),
		}
	}

	/**
	 * Clear all pending requests (use with caution)
	 */
	clear(): void {
		this.pendingRequests.clear()
		this._logger.warn('All pending requests cleared')
	}

	private async executeWithCleanup(key: string, fn: () => Promise<T>): Promise<T> {
		try {
			return await fn()
		}
		finally {
			// Small delay before cleanup to allow late joiners
			setTimeout(() => {
				this.pendingRequests.delete(key)
				this._logger.debug(`Request completed and removed for key: ${key}`)
			}, 100)
		}
	}

	private cleanupStaleEntries(): void {
		const now = Date.now()
		let cleaned = 0

		for (const [key, pending] of this.pendingRequests.entries()) {
			if (now - pending.timestamp > this.maxPendingAge) {
				this.pendingRequests.delete(key)
				cleaned++
			}
		}

		if (cleaned > 0) {
			this._logger.warn(`Cleaned up ${cleaned} stale pending requests`)
		}
	}
}

/**
 * Singleton instance for image processing deduplication
 */
export const imageProcessingDeduplicator = new RequestDeduplicator<void>(60000)
