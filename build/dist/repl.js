"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _core = require("@nestjs/core");
const _MediaStreamModule = /*#__PURE__*/ _interop_require_default(require("./MediaStream/Module/MediaStreamModule"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
async function bootstrap() {
    const replServer = await (0, _core.repl)(_MediaStreamModule.default);
    replServer.setupHistory(".nestjs_repl_history", (err)=>{
        if (err) {
            console.error(err);
        }
    });
}
bootstrap();
