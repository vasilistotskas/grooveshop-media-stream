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
var WebpImageManipulationJob_1;
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const manipulation_job_result_dto_1 = __importDefault(require("../dto/manipulation-job-result.dto"));
const common_1 = require("@nestjs/common");
const sharp_1 = __importDefault(require("sharp"));
let WebpImageManipulationJob = WebpImageManipulationJob_1 = class WebpImageManipulationJob {
    constructor() {
        this.logger = new common_1.Logger(WebpImageManipulationJob_1.name);
    }
    async handle(filePathFrom, filePathTo, options) {
        this.logger.debug(`WebpImageManipulationJob.handle called with format: ${options.format}`, {
            filePathFrom,
            filePathTo,
            format: options.format,
            width: options.width,
            height: options.height,
        });
        if (options.format === 'svg') {
            this.logger.debug(`SVG format requested. Source file: ${filePathFrom}`);
            const sourceExtension = (0, node_path_1.extname)(filePathFrom).toLowerCase();
            let isSourceSvg = sourceExtension === '.svg';
            this.logger.debug(`Source extension: ${sourceExtension}, isSourceSvg: ${isSourceSvg}`);
            if (!isSourceSvg) {
                try {
                    const fileContent = await (0, promises_1.readFile)(filePathFrom, 'utf8');
                    isSourceSvg = fileContent.trim().startsWith('<svg') || fileContent.includes('xmlns="http://www.w3.org/2000/svg"');
                    this.logger.debug(`Content-based SVG detection: ${isSourceSvg}`);
                }
                catch {
                    isSourceSvg = false;
                    this.logger.debug('Could not read file as text, assuming not SVG');
                }
            }
            if (isSourceSvg) {
                const needsResizing = (options.width !== null && !Number.isNaN(options.width))
                    || (options.height !== null && !Number.isNaN(options.height));
                if (!needsResizing) {
                    this.logger.debug(`SVG file needs no resizing, copying original`);
                    await (0, promises_1.copyFile)(filePathFrom, filePathTo);
                    const stats = await (0, promises_1.readFile)(filePathFrom);
                    const result = new manipulation_job_result_dto_1.default({
                        size: String(stats.length),
                        format: 'svg',
                    });
                    this.logger.debug(`SVG copy result: ${JSON.stringify(result)}`);
                    return result;
                }
                else {
                    const manipulation = (0, sharp_1.default)(filePathFrom);
                    manipulation.png({ quality: options.quality });
                    const resizeScales = {};
                    if (options.width !== null && !Number.isNaN(options.width)) {
                        resizeScales.width = Number(options.width);
                    }
                    if (options.height !== null && !Number.isNaN(options.height)) {
                        resizeScales.height = Number(options.height);
                    }
                    manipulation.resize({
                        ...resizeScales,
                        fit: options.fit,
                        position: options.position,
                        background: options.background,
                    });
                    const manipulatedFile = await manipulation.toFile(filePathTo);
                    const result = new manipulation_job_result_dto_1.default({
                        size: String(manipulatedFile.size),
                        format: 'png',
                    });
                    this.logger.debug(`SVG resized to PNG. Result: ${JSON.stringify(result)}`);
                    return result;
                }
            }
            else {
                this.logger.debug('Non-SVG source with SVG output requested, converting to PNG');
                const manipulation = (0, sharp_1.default)(filePathFrom);
                manipulation.png({ quality: options.quality });
                const resizeScales = {};
                if (options.width !== null && !Number.isNaN(options.width)) {
                    resizeScales.width = Number(options.width);
                }
                if (options.height !== null && !Number.isNaN(options.height)) {
                    resizeScales.height = Number(options.height);
                }
                this.logger.debug(`Resize scales: ${JSON.stringify(resizeScales)}`);
                if (Object.keys(resizeScales).length > 0) {
                    if (options.trimThreshold !== null && !Number.isNaN(options.trimThreshold)) {
                        manipulation.trim({
                            background: options.background,
                            threshold: Number(options.trimThreshold),
                        });
                    }
                    manipulation.resize({
                        ...resizeScales,
                        fit: options.fit,
                        position: options.position,
                        background: options.background,
                    });
                }
                const manipulatedFile = await manipulation.toFile(filePathTo);
                this.logger.debug(`Manipulation complete. Result format: png, size: ${manipulatedFile.size}`);
                return new manipulation_job_result_dto_1.default({
                    size: String(manipulatedFile.size),
                    format: 'png',
                });
            }
        }
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
        ['width', 'height'].forEach((scale) => {
            const value = options[scale];
            if (value !== null && !Number.isNaN(value)) {
                resizeScales[scale] = Number(value);
            }
        });
        if (Object.keys(resizeScales).length > 0) {
            if (options.trimThreshold !== null && !Number.isNaN(options.trimThreshold)) {
                manipulation.trim({
                    background: options.background,
                    threshold: Number(options.trimThreshold),
                });
            }
            manipulation.resize({
                ...resizeScales,
                fit: options.fit,
                position: options.position,
                background: options.background,
            });
        }
        const manipulatedFile = await manipulation.toFile(filePathTo);
        return new manipulation_job_result_dto_1.default({
            size: String(manipulatedFile.size),
            format: manipulatedFile.format,
        });
    }
};
WebpImageManipulationJob = WebpImageManipulationJob_1 = __decorate([
    (0, common_1.Injectable)({ scope: common_1.Scope.REQUEST })
], WebpImageManipulationJob);
exports.default = WebpImageManipulationJob;
//# sourceMappingURL=webp-image-manipulation.job.js.map