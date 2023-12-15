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
    const app = await _core.NestFactory.create(_MediaStreamModule.default, {
        snapshot: true
    });
    await app.listen(3003);
}
bootstrap();
