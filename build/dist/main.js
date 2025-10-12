"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrap = bootstrap;
const process = __importStar(require("node:process"));
const config_service_1 = require("./MediaStream/Config/config.service");
const media_stream_module_1 = __importDefault(require("./MediaStream/media-stream.module"));
const core_1 = require("@nestjs/core");
const compression_1 = __importDefault(require("compression"));
const helmet_1 = __importDefault(require("helmet"));
async function bootstrap(exitProcess = true) {
    try {
        const app = await core_1.NestFactory.create(media_stream_module_1.default);
        const configService = app.get(config_service_1.ConfigService);
        app.use((0, helmet_1.default)({
            contentSecurityPolicy: false,
            crossOriginResourcePolicy: { policy: 'cross-origin' },
        }));
        app.use((0, compression_1.default)({
            level: 6,
            threshold: 1024,
            filter: (req, res) => {
                const contentType = res.getHeader('Content-Type');
                if (contentType && typeof contentType === 'string' && contentType.startsWith('image/')) {
                    return false;
                }
                return compression_1.default.filter(req, res);
            },
        }));
        app.useStaticAssets('public');
        const serverConfig = configService.get('server');
        app.enableCors({
            origin: serverConfig.cors.origin,
            methods: serverConfig.cors.methods,
            maxAge: serverConfig.cors.maxAge,
        });
        await app.listen(serverConfig.port, serverConfig.host);
        console.warn(`Application is running on: http://${serverConfig.host}:${serverConfig.port}`);
    }
    catch (error) {
        console.error('Failed to start application:', error);
        if (exitProcess) {
            process.exit(1);
        }
        else {
            throw error;
        }
    }
}
if (require.main === module) {
    bootstrap(true).catch((error) => {
        console.error('Unhandled error during bootstrap:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=main.js.map