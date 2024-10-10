import type { NestExpressApplication } from '@nestjs/platform-express'
import MediaStreamModule from '@microservice/Module/MediaStreamModule'
import { NestFactory } from '@nestjs/core'

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create<NestExpressApplication>(MediaStreamModule)
	app.useStaticAssets('public')
	await app.listen(3003)
}
bootstrap().catch((error) => {
	console.error('Error during application bootstrap:', error)
})
