import type { NestExpressApplication } from '@nestjs/platform-express'
import * as process from 'node:process'
import * as zlib from 'node:zlib'
import { ConfigService } from '#microservice/Config/config.service'
import MediaStreamModule from '#microservice/media-stream.module'
import { NestFactory } from '@nestjs/core'
import compression from 'compression'
import helmet from 'helmet'

/**
 * Bootstrap the NestJS application
 * @param exitProcess If true, will call process.exit on error (default in production)
 * @returns A promise that resolves when the application is started
 */
export async function bootstrap(exitProcess = true): Promise<void> {
	try {
		const app = await NestFactory.create<NestExpressApplication>(MediaStreamModule)
		const configService = app.get(ConfigService)

		// Security headers with Helmet
		app.use(helmet({
			contentSecurityPolicy: false, // Allow images from any source
			crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin resource sharing
			// Prevent MIME type sniffing
			noSniff: true,
		}))

		// HTTP Compression with Brotli and Gzip support
		// Brotli provides ~20% better compression than gzip for text content
		app.use(compression({
			level: 6, // Balance between speed (1) and compression (9)
			threshold: 1024, // Only compress responses > 1KB
			// Enable Brotli compression (preferred) with gzip fallback
			brotli: {
				enabled: true,
				zlib: {
					params: {
						[zlib.constants.BROTLI_PARAM_QUALITY]: 4, // Balance speed vs compression (0-11)
					},
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

		await app.listen(serverConfig.port, serverConfig.host)
		console.warn(`Application is running on: http://${serverConfig.host}:${serverConfig.port}`)
	}
	catch (error: unknown) {
		console.error('Failed to start application:', error)
		if (exitProcess) {
			process.exit(1)
		}
		else {
			throw error
		}
	}
}

// Only run bootstrap if not in test environment
if (process.env.NODE_ENV !== 'test') {
	void (async () => {
		try {
			await bootstrap(true)
		}
		catch (error) {
			console.error('Unhandled error during bootstrap:', error)
			process.exit(1)
		}
	})()
}
