"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const MediaStreamModule_1 = require("./MediaStream/Module/MediaStreamModule");
async function bootstrap() {
    const app = await core_1.NestFactory.create(MediaStreamModule_1.default);
    await app.listen(3003);
}
bootstrap();
//# sourceMappingURL=main.js.map