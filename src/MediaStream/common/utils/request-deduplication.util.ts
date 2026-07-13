/**
 * Request deduplication utility
 * Prevents duplicate processing of identical concurrent requests
 */

import type { OnModuleDestroy } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

export interface PendingRequest<T> {
	promise: Promise<T>
	timestamp: number
	refCount: number
}

@Injectable()
export class RequestDeduplicator<T = void> implements OnModuleDestroy {
	private readonly pendingRequests = new Map<string, PendingRequest<T>>()
	private readonly maxPendingAge: number = 60000
	private readonly cleanupIntervalMs: number = 30000
	private cleanupInterval: NodeJS.Timeout | null = null

	constructor() {
		this.cleanupInterval = setInterval(() => this.cleanupStaleEntries(), this.cleanupIntervalMs)
	}

	onModuleDestroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval)
			this.cleanupInterval = null
		}
		this.pendingRequests.clear()
		CorrelatedLogger.log('Request deduplicator destroyed', RequestDeduplicator.name)
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
			CorrelatedLogger.debug(`Request deduplicated for key: ${key} (refs: ${existing.refCount})`, RequestDeduplicator.name)
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
		CorrelatedLogger.debug(`New request started for key: ${key}`, RequestDeduplicator.name)

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
		CorrelatedLogger.warn('All pending requests cleared', RequestDeduplicator.name)
	}

	private async executeWithCleanup(key: string, fn: () => Promise<T>): Promise<T> {
		try {
			const result = await fn()
			// Success: keep in map briefly to allow late joiners to share the result
			setTimeout(() => {
				this.pendingRequests.delete(key)
				CorrelatedLogger.debug(`Request completed and removed for key: ${key}`, RequestDeduplicator.name)
			}, 100)
			return result
		}
		catch (error: unknown) {
			// Failure: remove immediately so the next request retries rather than
			// receiving the cached rejection
			this.pendingRequests.delete(key)
			CorrelatedLogger.debug(`Request failed and removed for key: ${key}`, RequestDeduplicator.name)
			throw error
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
			CorrelatedLogger.warn(`Cleaned up ${cleaned} stale pending requests`, RequestDeduplicator.name)
		}
	}
}
