/**
 * Graceful shutdown utility for handling process termination
 */

import type { INestApplication } from '@nestjs/common'
import { Logger } from '@nestjs/common'

// Use global process object for signal handling (node:process import doesn't work with SWC)
declare const process: NodeJS.Process

const logger = new Logger('GracefulShutdown')

interface ShutdownOptions {
	timeout: number
	forceTimeout: number
	onShutdown?: () => Promise<void>
}

interface ShutdownState {
	isShuttingDown: boolean
	activeRequests: number
}

const state: ShutdownState = {
	isShuttingDown: false,
	activeRequests: 0,
}

/**
 * Track active request (call at start of request)
 */
export function trackRequestStart(): void {
	if (!state.isShuttingDown) {
		state.activeRequests++
	}
}

/**
 * Track request completion (call at end of request)
 * Uses WeakSet to prevent double-counting when both 'finish' and 'close' events fire
 */
const trackedResponses = new WeakSet<object>()

export function trackRequestEnd(res?: object): void {
	// If response object provided, check if already tracked to prevent double-counting
	if (res) {
		if (trackedResponses.has(res)) {
			return // Already tracked this response completion
		}
		trackedResponses.add(res)
	}
	state.activeRequests = Math.max(0, state.activeRequests - 1)
}

/**
 * Check if shutdown is in progress
 */
export function isShuttingDown(): boolean {
	return state.isShuttingDown
}

/**
 * Get current active request count
 */
export function getActiveRequestCount(): number {
	return state.activeRequests
}

/**
 * Setup graceful shutdown handlers
 */
export function setupGracefulShutdown(
	app: INestApplication,
	options: ShutdownOptions,
): void {
	const { timeout, forceTimeout, onShutdown } = options

	const shutdown = async (signal: string): Promise<void> => {
		if (state.isShuttingDown) {
			logger.warn(`Shutdown already in progress, ignoring ${signal}`)
			return
		}

		state.isShuttingDown = true
		logger.log(`Received ${signal}, starting graceful shutdown...`)

		// Set force shutdown timer
		const forceTimer = setTimeout(() => {
			logger.error(`Force shutdown after ${forceTimeout}ms - some requests may have been dropped`)
			process.exit(1)
		}, forceTimeout)

		try {
			// Wait for active requests to complete (with timeout)
			const waitStart = Date.now()
			while (state.activeRequests > 0 && (Date.now() - waitStart) < timeout) {
				logger.log(`Waiting for ${state.activeRequests} active requests to complete...`)
				await new Promise(resolve => setTimeout(resolve, 1000))
			}

			if (state.activeRequests > 0) {
				logger.warn(`Timeout reached with ${state.activeRequests} requests still active`)
			}
			else {
				logger.log('All active requests completed')
			}

			// Run custom shutdown handler
			if (onShutdown) {
				logger.log('Running custom shutdown handler...')
				await onShutdown()
			}

			// Close the NestJS application
			logger.log('Closing NestJS application...')
			await app.close()

			clearTimeout(forceTimer)
			logger.log('Graceful shutdown completed')
			process.exit(0)
		}
		catch (error) {
			logger.error('Error during shutdown:', error)
			clearTimeout(forceTimer)
			process.exit(1)
		}
	}

	// Register signal handlers
	process.on('SIGTERM', () => shutdown('SIGTERM'))
	process.on('SIGINT', () => shutdown('SIGINT'))

	// Handle uncaught exceptions during shutdown
	process.on('uncaughtException', (error) => {
		logger.error('Uncaught exception:', error)
		if (!state.isShuttingDown) {
			shutdown('uncaughtException')
		}
	})

	process.on('unhandledRejection', (reason) => {
		logger.error('Unhandled rejection:', reason)
		if (!state.isShuttingDown) {
			shutdown('unhandledRejection')
		}
	})

	logger.log('Graceful shutdown handlers registered')
}

/**
 * Middleware to reject new requests during shutdown
 */
export function shutdownMiddleware(_req: any, res: any, next: any): void {
	if (state.isShuttingDown) {
		res.status(503).json({
			error: 'Service Unavailable',
			message: 'Server is shutting down',
		})
		return
	}

	trackRequestStart()

	// Track request completion - pass res to prevent double-counting
	// Both 'finish' and 'close' can fire for the same response
	res.on('finish', () => trackRequestEnd(res))
	res.on('close', () => trackRequestEnd(res))

	next()
}
