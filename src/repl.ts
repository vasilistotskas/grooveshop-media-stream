import MediaStreamModule from '@microservice/Module/MediaStreamModule'
import { repl } from '@nestjs/core'

async function bootstrap(): Promise<void> {
	const replServer = await repl(MediaStreamModule)
	replServer.setupHistory('.nestjs_repl_history', (err) => {
		if (err) {
			console.error(err)
		}
	})
}
bootstrap().catch((error) => {
	console.error('Error during application bootstrap:', error)
})
