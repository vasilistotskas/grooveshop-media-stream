import type { CorrelationService as ICorrelationService, RequestContext } from '../interfaces/correlation.interface.js'
import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { requestContextStorage } from '../async-local-storage.js'

@Injectable()
export class CorrelationService implements ICorrelationService {
	/**
	 * Generate a new correlation ID using UUID v4
	 */
	generateCorrelationId(): string {
		return randomUUID()
	}

	/**
	 * Set the request context for the current async context
	 */
	setContext(context: RequestContext): void {
		requestContextStorage.enterWith(context)
	}

	/**
	 * Get the current request context
	 */
	getContext(): RequestContext | null {
		return requestContextStorage.getStore() || null
	}

	/**
	 * Get the correlation ID from the current context
	 */
	getCorrelationId(): string | null {
		const context = this.getContext()
		return context?.correlationId || null
	}

	/**
	 * Clear the current context (mainly for testing)
	 */
	clearContext(): void {
		requestContextStorage.enterWith(undefined as unknown as RequestContext)
	}

	/**
	 * Run a function within a specific correlation context
	 */
	runWithContext<T>(context: RequestContext, fn: () => T): T {
		return requestContextStorage.run(context, fn)
	}

	/**
	 * Update the current context with additional data
	 */
	updateContext(updates: Partial<RequestContext>): void {
		const currentContext = this.getContext()
		if (currentContext) {
			const updatedContext = { ...currentContext, ...updates }
			this.setContext(updatedContext)
		}
	}

	/**
	 * Get the client IP from the current context
	 */
	getClientIp(): string {
		const context = this.getContext()
		return context?.clientIp || 'unknown'
	}

	/**
	 * Get the user agent from the current context
	 */
	getUserAgent(): string {
		const context = this.getContext()
		return context?.userAgent || 'unknown'
	}
}
