import { NestFactory } from '@nestjs/core'
import MediaStreamModule from '@microservice/Module/MediaStreamModule'

async function bootstrap() {
	const app = await NestFactory.create(MediaStreamModule, {
		snapshot: true
	})
	await app.listen(3003)
}
bootstrap()
