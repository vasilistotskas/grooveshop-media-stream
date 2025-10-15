import type { NestExpressApplication } from '@nestjs/platform-express'
import * as process from 'node:process'
import { ConfigService } from '@microservice/Config/config.service'
import MediaStreamModule from '@microservice/media-stream.module'
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

		app.use(helmet({
			contentSecurityPolicy: false,
			crossOriginResourcePolicy: { policy: 'cross-origin' },
		}))

		app.use(compression({
			level: 6,
			threshold: 1024,
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

if (require.main === module) {
	bootstrap(true).catch((error: unknown) => {
		console.error('Unhandled error during bootstrap:', error)
		process.exit(1)
	})
}
