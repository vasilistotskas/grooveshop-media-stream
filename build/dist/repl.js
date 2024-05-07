"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const MediaStreamModule_1 = __importDefault(require("./MediaStream/Module/MediaStreamModule"));
async function bootstrap() {
    const replServer = await (0, core_1.repl)(MediaStreamModule_1.default);
    replServer.setupHistory('.nestjs_repl_history', (err) => {
        if (err) {
            console.error(err);
        }
    });
}
bootstrap();
//# sourceMappingURL=repl.js.map