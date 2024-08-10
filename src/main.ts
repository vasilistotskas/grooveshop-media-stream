import { NestFactory } from '@nestjs/core'
import MediaStreamModule from '@microservice/Module/MediaStreamModule'
import type { NestExpressApplication } from '@nestjs/platform-express'

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create<NestExpressApplication>(MediaStreamModule)
	app.useStaticAssets('public')
	await app.listen(3003)
}
bootstrap()
