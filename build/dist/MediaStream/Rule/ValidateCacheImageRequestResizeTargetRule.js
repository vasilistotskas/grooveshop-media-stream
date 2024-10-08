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
const RequestedResizeTargetTooLargeException_1 = __importDefault(require("../API/Exception/RequestedResizeTargetTooLargeException"));
const common_1 = require("@nestjs/common");
let ValidateCacheImageRequestResizeTargetRule = class ValidateCacheImageRequestResizeTargetRule {
    constructor() {
        this.allowedPixelCount = 7680 * 4320;
        this.request = null;
    }
    async setup(request) {
        this.request = request;
    }
    async apply() {
        const { width, height } = this.request.resizeOptions;
        const pixelCount = width * height;
        if (pixelCount > this.allowedPixelCount) {
            throw new RequestedResizeTargetTooLargeException_1.default(this.request.resizeOptions, this.allowedPixelCount);
        }
    }
};
ValidateCacheImageRequestResizeTargetRule = __decorate([
    (0, common_1.Injectable)({ scope: common_1.Scope.REQUEST })
], ValidateCacheImageRequestResizeTargetRule);
exports.default = ValidateCacheImageRequestResizeTargetRule;
//# sourceMappingURL=ValidateCacheImageRequestResizeTargetRule.js.map