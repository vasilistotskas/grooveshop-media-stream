import type { RequestContext } from './interfaces/correlation.interface.js'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Shared AsyncLocalStorage singleton for request context propagation.
 * Used by CorrelationService, PerformanceTracker, and CorrelatedLogger
 * to access the current request context without dependency injection.
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>()
