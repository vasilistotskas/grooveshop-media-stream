import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { CorrelationService as ICorrelationService, RequestContext } from '../interfaces/correlation.interface'

@Injectable()
export class CorrelationService implements ICorrelationService {
	private readonly asyncLocalStorage = new AsyncLocalStorage<RequestContext>()

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
		this.asyncLocalStorage.enterWith(context)
	}

	/**
	 * Get the current request context
	 */
	getContext(): RequestContext | null {
		return this.asyncLocalStorage.getStore() || null
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
		this.asyncLocalStorage.disable()
	}

	/**
	 * Run a function within a specific correlation context
	 */
	runWithContext<T>(context: RequestContext, fn: () => T): T {
		return this.asyncLocalStorage.run(context, fn)
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
