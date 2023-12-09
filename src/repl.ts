import { repl } from '@nestjs/core'
import MediaStreamModule from '@microservice/Module/MediaStreamModule'

async function bootstrap() {
	const replServer = await repl(MediaStreamModule)
	replServer.setupHistory('.nestjs_repl_history', (err) => {
		if (err) {
			console.error(err)
		}
	})
}
bootstrap()
