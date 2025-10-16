import MediaStreamModule from "./MediaStream/media-stream.module.js";
import { repl } from "@nestjs/core";
async function bootstrap() {
    const replServer = await repl(MediaStreamModule);
    replServer.setupHistory('.nestjs_repl_history', (err)=>{
        if (err) {
            console.error(err);
        }
    });
}
bootstrap().catch((error)=>{
    console.error('Error during application bootstrap:', error);
});

//# sourceMappingURL=repl.js.map