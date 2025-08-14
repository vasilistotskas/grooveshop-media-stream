"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const media_stream_module_1 = __importDefault(require("./MediaStream/media-stream.module"));
const core_1 = require("@nestjs/core");
async function bootstrap() {
    const replServer = await (0, core_1.repl)(media_stream_module_1.default);
    replServer.setupHistory('.nestjs_repl_history', (err) => {
        if (err) {
            console.error(err);
        }
    });
}
bootstrap().catch((error) => {
    console.error('Error during application bootstrap:', error);
});
//# sourceMappingURL=repl.js.map