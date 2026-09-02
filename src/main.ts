import type { LogLevel } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { ShutdownConfig } from '#microservice/Config/interfaces/app-config.interface'
import * as process from 'node:process'
import * as zlib from 'node:zlib'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import compression from 'compression'
import helmet from 'helmet'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { setupGracefulShutdown, shutdownMiddleware } from '#microservice/common/utils/graceful-shutdown.util'
import { isTest } from '#microservice/common/utils/runtime-env.util'
import { ConfigService } from '#microservice/Config/config.service'
import MediaStreamModule from '#microservice/media-stream.module'

const logger = new Logger('Bootstrap')

interface BootstrapOptions {
	/** If true, will call process.exit on error (default in production) */
	exitProcess?: boolean
	/** If true, will setup graceful shutdown handlers (default true) */
	enableGracefulShutdown?: boolean
}

/**
 * Resolve the NestJS log levels enabled at runtime from `LOG_LEVEL`.
 *
 * LOG_LEVEL is the one setting read straight from the environment: it
 * configures the logger passed to NestFactory.create, which runs before any
 * provider (including ConfigService) exists.
 *
 * Supported values (case-insensitive):
 *   - `error`           → ['error']
 *   - `warn`            → ['error', 'warn']
 *   - `info` / `log`    → ['error', 'warn', 'log']  (default)
 *   - `debug`           → ['error', 'warn', 'log', 'debug']
 *   - `verbose`         → ['error', 'warn', 'log', 'debug', 'verbose']
 *
 * Without filtering, NestJS emits every level including `debug`, which
 * floods the logs with one entry per cache hit, health probe, metrics tick.
 */
function resolveLogLevels(): LogLevel[] {
	const { LOG_LEVEL = 'info' } = process.env
	switch (LOG_LEVEL.toLowerCase()) {
		case 'error':
			return ['error']
		case 'warn':
			return ['error', 'warn']
		case 'debug':
			return ['error', 'warn', 'log', 'debug']
		case 'verbose':
			return ['error', 'warn', 'log', 'debug', 'verbose']
		case 'info':
		case 'log':
		default:
			return ['error', 'warn', 'log']
	}
}

export async function bootstrap(options: BootstrapOptions = {}): Promise<void> {
	const opts: Required<BootstrapOptions> = {
		exitProcess: true,
		enableGracefulShutdown: true,
		...options,
	}

	try {
		const app = await NestFactory.create<NestExpressApplication>(MediaStreamModule, {
			logger: resolveLogLevels(),
		})

		// Trust exactly 1 proxy hop (Traefik) so that req.ip reflects the real
		// client IP from X-Forwarded-For rather than the ingress pod address.
		// Setting this to 1 (not true) avoids trusting the full XFF chain,
		// which would allow a remote client to spoof their IP by prepending
		// arbitrary addresses to X-Forwarded-For.
		app.set('trust proxy', 1)

		const configService = app.get(ConfigService)

		// Graceful shutdown middleware (must be first, only if enabled)
		if (opts.enableGracefulShutdown) {
			app.use(shutdownMiddleware)
		}

		// Security headers with Helmet. The landing page is static markup with
		// one inline <style> block, hence 'unsafe-inline' for styles only;
		// scripts stay fully disabled.
		app.use(helmet({
			contentSecurityPolicy: {
				directives: {
					defaultSrc: ['\'none\''],
					imgSrc: ['\'self\'', 'data:'],
					styleSrc: ['\'self\'', '\'unsafe-inline\''],
					scriptSrc: ['\'none\''],
					objectSrc: ['\'none\''],
					frameAncestors: ['\'none\''],
				},
			},
			crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin resource sharing
			// Prevent MIME type sniffing
			noSniff: true,
		}))

		// HTTP Compression with Brotli and Gzip support
		// Brotli provides ~20% better compression than gzip for text content
		app.use(compression({
			level: 6, // Balance between speed (1) and compression (9)
			threshold: 1024, // Only compress responses > 1KB
			// Brotli compression params
			brotli: {
				params: {
					[zlib.constants.BROTLI_PARAM_QUALITY]: 4, // Balance speed vs compression (0-11)
				},
			},
			filter: (req, res) => {
				const contentType = res.getHeader('Content-Type')
				// Don't compress images (already compressed formats)
				if (contentType && typeof contentType === 'string' && contentType.startsWith('image/')) {
					return false
				}
				return compression.filter(req, res)
			},
		}))

		app.useStaticAssets('public')

		const serverConfig = configService.get('server')
		app.enableCors({
			origin: serverConfig.cors.origin,
			methods: serverConfig.cors.methods,
			maxAge: serverConfig.cors.maxAge,
		})

		if (opts.enableGracefulShutdown) {
			const shutdown = configService.get<ShutdownConfig>('shutdown')
			setupGracefulShutdown(app, {
				timeout: shutdown.timeout,
				forceTimeout: shutdown.forceTimeout,
			})
		}

		await app.listen(serverConfig.port, serverConfig.host)
		logger.log(`Application is running on: http://${serverConfig.host}:${serverConfig.port}`)
	}
	catch (error: unknown) {
		logger.error(`Failed to start application: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined)
		if (opts.exitProcess) {
			process.exit(1)
		}
		else {
			throw error
		}
	}
}

// Only run bootstrap if not in test environment
if (!isTest()) {
	void (async () => {
		try {
			await bootstrap()
		}
		catch (error) {
			logger.error(`Unhandled error during bootstrap: ${errorMessage(error)}`, error instanceof Error ? error.stack : undefined)
			process.exit(1)
		}
	})()
}
