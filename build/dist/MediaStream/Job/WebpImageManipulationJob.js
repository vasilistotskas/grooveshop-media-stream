"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ManipulationJobResult_1 = __importDefault(require("../DTO/ManipulationJobResult"));
const common_1 = require("@nestjs/common");
const lodash_1 = require("lodash");
const sharp_1 = __importDefault(require("sharp"));
let WebpImageManipulationJob = class WebpImageManipulationJob {
    async handle(filePathFrom, filePathTo, options) {
        const manipulation = (0, sharp_1.default)(filePathFrom);
        switch (options.format) {
            case 'jpeg':
                manipulation.jpeg({ quality: options.quality });
                break;
            case 'png':
                manipulation.png({ quality: options.quality });
                break;
            case 'webp':
                manipulation.webp({ quality: options.quality });
                break;
            case 'gif':
                manipulation.gif();
                break;
            case 'tiff':
                manipulation.tiff();
                break;
            default:
                manipulation.webp({ quality: options.quality });
        }
        const resizeScales = {};
        (0, lodash_1.each)(['width', 'height'], (scale) => {
            if (options[scale] !== null && !Number.isNaN(options[scale])) {
                resizeScales[scale] = Number(options[scale]);
            }
        });
        if (Object.keys(resizeScales).length > 0) {
            if (options.trimThreshold !== null && !Number.isNaN(options.trimThreshold)) {
                manipulation.trim({ background: options.background, threshold: Number(options.trimThreshold) });
            }
            manipulation.resize({
                ...resizeScales,
                fit: options.fit,
                position: options.position,
                background: options.background,
            });
        }
        const manipulatedFile = await manipulation.toFile(filePathTo);
        return new ManipulationJobResult_1.default({
            size: String(manipulatedFile.size),
            format: manipulatedFile.format,
        });
    }
};
WebpImageManipulationJob = __decorate([
    (0, common_1.Injectable)({ scope: common_1.Scope.REQUEST })
], WebpImageManipulationJob);
exports.default = WebpImageManipulationJob;
//# sourceMappingURL=WebpImageManipulationJob.js.map