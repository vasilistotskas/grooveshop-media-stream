import * as process from "node:process";
import { ConfigService } from "./MediaStream/Config/config.service.js";
import MediaStreamModule from "./MediaStream/media-stream.module.js";
import { NestFactory } from "@nestjs/core";
import compression from "compression";
import helmet from "helmet";
/**
 * Bootstrap the NestJS application
 * @param exitProcess If true, will call process.exit on error (default in production)
 * @returns A promise that resolves when the application is started
 */ export async function bootstrap(exitProcess = true) {
    try {
        const app = await NestFactory.create(MediaStreamModule);
        const configService = app.get(ConfigService);
        // Security headers with Helmet
        app.use(helmet({
            contentSecurityPolicy: false,
            crossOriginResourcePolicy: {
                policy: 'cross-origin'
            }
        }));
        // HTTP Compression (but not for images - they're already compressed)
        app.use(compression({
            level: 6,
            threshold: 1024,
            filter: (req, res)=>{
                const contentType = res.getHeader('Content-Type');
                // Don't compress images (already compressed formats)
                if (contentType && typeof contentType === 'string' && contentType.startsWith('image/')) {
                    return false;
                }
                return compression.filter(req, res);
            }
        }));
        app.useStaticAssets('public');
        const serverConfig = configService.get('server');
        app.enableCors({
            origin: serverConfig.cors.origin,
            methods: serverConfig.cors.methods,
            maxAge: serverConfig.cors.maxAge
        });
        await app.listen(serverConfig.port, serverConfig.host);
        console.warn(`Application is running on: http://${serverConfig.host}:${serverConfig.port}`);
    } catch (error) {
        console.error('Failed to start application:', error);
        if (exitProcess) {
            process.exit(1);
        } else {
            throw error;
        }
    }
}
// Only run bootstrap if not in test environment
if (process.env.NODE_ENV !== 'test') {
    void (async ()=>{
        try {
            await bootstrap(true);
        } catch (error) {
            console.error('Unhandled error during bootstrap:', error);
            process.exit(1);
        }
    })();
}

//# sourceMappingURL=main.js.map