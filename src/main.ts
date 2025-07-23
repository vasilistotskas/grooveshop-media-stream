import type { NestExpressApplication } from '@nestjs/platform-express'
import * as process from 'node:process'
import { ConfigService } from '@microservice/Config/config.service'
import MediaStreamModule from '@microservice/Module/MediaStreamModule'
import { NestFactory } from '@nestjs/core'

/**
 * Bootstrap the NestJS application
 * @param exitProcess If true, will call process.exit on error (default in production)
 * @returns A promise that resolves when the application is started
 */
export async function bootstrap(exitProcess = true): Promise<void> {
	try {
		const app = await NestFactory.create<NestExpressApplication>(MediaStreamModule)
		const configService = app.get(ConfigService)

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
	catch (error) {
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
	bootstrap(true).catch((error) => {
		console.error('Unhandled error during bootstrap:', error)
		process.exit(1)
	})
}
