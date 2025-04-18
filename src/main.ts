import type { NestExpressApplication } from '@nestjs/platform-express'
import * as process from 'node:process'
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

		app.useStaticAssets('public')
		app.enableCors({
			origin: '*',
			methods: 'GET',
			maxAge: 86400, // 24 hours
		})

		const port = process.env.PORT || 3003
		await app.listen(port)
	}
	catch (error) {
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
