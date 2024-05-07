"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const MediaStreamModule_1 = __importDefault(require("./MediaStream/Module/MediaStreamModule"));
async function bootstrap() {
    const app = await core_1.NestFactory.create(MediaStreamModule_1.default);
    app.useStaticAssets('public');
    await app.listen(3003);
}
bootstrap();
//# sourceMappingURL=main.js.map