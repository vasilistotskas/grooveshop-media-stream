import type { RequestContext } from '../interfaces/correlation.interface.js'
import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { requestContextStorage } from '../async-local-storage.js'

@Injectable()
export class CorrelationService {
	generateCorrelationId(): string {
		return randomUUID()
	}

	/** Bind a context to the current async scope (used to update an existing one). */
	setContext(context: RequestContext): void {
		requestContextStorage.enterWith(context)
	}

	getContext(): RequestContext | null {
		return requestContextStorage.getStore() || null
	}

	getCorrelationId(): string | null {
		return this.getContext()?.correlationId || null
	}

	/** Run `fn` with `context` as the async-local store (the middleware entry point). */
	runWithContext<T>(context: RequestContext, fn: () => T): T {
		return requestContextStorage.run(context, fn)
	}

	updateContext(updates: Partial<RequestContext>): void {
		const currentContext = this.getContext()
		if (currentContext) {
			this.setContext({ ...currentContext, ...updates })
		}
	}
}
