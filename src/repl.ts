import MediaStreamModule from '@microservice/media-stream.module'
import { repl } from '@nestjs/core'

async function bootstrap(): Promise<void> {
	const replServer = await repl(MediaStreamModule)
	replServer.setupHistory('.nestjs_repl_history', (err: unknown) => {
		if (err) {
			console.error(err)
		}
	})
}
bootstrap().catch((error: unknown) => {
	console.error('Error during application bootstrap:', error)
})
