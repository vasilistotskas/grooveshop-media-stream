function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import RequestedResizeTargetTooLargeException from "../../API/exceptions/requested-resize-target-too-large.exception.js";
import { Injectable, Scope } from "@nestjs/common";
let ValidateCacheImageRequestResizeTargetRule = class ValidateCacheImageRequestResizeTargetRule {
    async setup(request) {
        this.request = request;
    }
    async apply() {
        const { width, height } = this.request.resizeOptions;
        if (width === null || height === null) {
            return;
        }
        const pixelCount = width * height;
        if (pixelCount > this.allowedPixelCount) {
            throw new RequestedResizeTargetTooLargeException(this.request.resizeOptions, this.allowedPixelCount);
        }
    }
    constructor(){
        this.allowedPixelCount = 7680 * 4320;
    }
};
export { ValidateCacheImageRequestResizeTargetRule as default };
ValidateCacheImageRequestResizeTargetRule = _ts_decorate([
    Injectable({
        scope: Scope.REQUEST
    })
], ValidateCacheImageRequestResizeTargetRule);

//# sourceMappingURL=validate-cache-image-request-resize-target.rule.js.map