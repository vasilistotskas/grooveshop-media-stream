import type { INestApplication } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
// Default import on purpose: `process.on` is inherited from EventEmitter and is
// not a named export of the module namespace (undefined under `import * as`).
import process from 'node:process'
import { Logger } from '@nestjs/common'
import { errorMessage } from './error-message.util.js'

const logger = new Logger('GracefulShutdown')

/** How often the drain loop re-checks the in-flight request count. */
const DRAIN_POLL_MS = 1000

interface ShutdownOptions {
	/** Soft limit: how long to wait for in-flight requests before closing anyway. */
	timeout: number
	/** Hard limit: `process.exit(1)` if the shutdown has not completed by then. */
	forceTimeout: number
}

const state = {
	isShuttingDown: false,
	activeRequests: 0,
}

/** Both 'finish' and 'close' fire for one response; count its completion once. */
const trackedResponses = new WeakSet<object>()

function trackRequestStart(): void {
	if (!state.isShuttingDown) {
		state.activeRequests++
	}
}

function trackRequestEnd(res: object): void {
	if (trackedResponses.has(res)) {
		return
	}
	trackedResponses.add(res)
	state.activeRequests = Math.max(0, state.activeRequests - 1)
}

export function isShuttingDown(): boolean {
	return state.isShuttingDown
}

/**
 * Two-tier shutdown on SIGTERM/SIGINT: wait for in-flight requests (soft
 * timeout), close the Nest app, exit 0; a force timer exits 1 if that hangs.
 */
export function setupGracefulShutdown(app: INestApplication, options: ShutdownOptions): void {
	const { timeout, forceTimeout } = options

	const shutdown = async (signal: string): Promise<void> => {
		if (state.isShuttingDown) {
			logger.warn(`Shutdown already in progress, ignoring ${signal}`)
			return
		}

		state.isShuttingDown = true
		logger.log(`Received ${signal}, starting graceful shutdown...`)

		const forceTimer = setTimeout(() => {
			logger.error(`Force shutdown after ${forceTimeout}ms - some requests may have been dropped`)
			process.exit(1)
		}, forceTimeout)

		try {
			const waitStart = Date.now()
			while (state.activeRequests > 0 && (Date.now() - waitStart) < timeout) {
				logger.log(`Waiting for ${state.activeRequests} active requests to complete...`)
				await new Promise(resolve => setTimeout(resolve, DRAIN_POLL_MS))
			}

			if (state.activeRequests > 0) {
				logger.warn(`Timeout reached with ${state.activeRequests} requests still active`)
			}
			else {
				logger.log('All active requests completed')
			}

			logger.log('Closing NestJS application...')
			await app.close()

			clearTimeout(forceTimer)
			logger.log('Graceful shutdown completed')
			process.exit(0)
		}
		catch (error: unknown) {
			logger.error(`Error during shutdown: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined)
			clearTimeout(forceTimer)
			process.exit(1)
		}
	}

	process.on('SIGTERM', () => shutdown('SIGTERM'))
	process.on('SIGINT', () => shutdown('SIGINT'))

	// Log unexpected errors but do NOT initiate shutdown. A transient
	// fire-and-forget rejection (a failed cache backfill, a dropped upstream
	// fetch) is not a reason to tear down the pod and drop every other
	// in-flight request; K8s probes cover the "process is wedged" case.
	process.on('uncaughtException', (error) => {
		logger.error(`Uncaught exception (continuing): ${errorMessage(error)}`, error.stack)
	})

	process.on('unhandledRejection', (reason) => {
		logger.error(`Unhandled rejection (continuing): ${errorMessage(reason)}`, reason instanceof Error ? reason.stack : undefined)
	})

	logger.log('Graceful shutdown handlers registered')
}

/**
 * First middleware in the chain: 503 for new requests while shutting down,
 * otherwise count the request until its response finishes or closes.
 */
export function shutdownMiddleware(_req: Request, res: Response, next: NextFunction): void {
	if (state.isShuttingDown) {
		res.status(503).json({
			error: 'Service Unavailable',
			message: 'Server is shutting down',
		})
		return
	}

	trackRequestStart()
	res.on('finish', () => trackRequestEnd(res))
	res.on('close', () => trackRequestEnd(res))

	next()
}
