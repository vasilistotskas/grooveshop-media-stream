"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return ValidateCacheImageRequestResizeTargetRule;
    }
});
const _common = require("@nestjs/common");
const _RequestedResizeTargetTooLargeException = /*#__PURE__*/ _interop_require_default(require("../API/Exception/RequestedResizeTargetTooLargeException"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
let ValidateCacheImageRequestResizeTargetRule = class ValidateCacheImageRequestResizeTargetRule {
    async setup(request) {
        this.request = request;
    }
    async apply() {
        const pixelCount = this.request.resizeOptions.width + this.request.resizeOptions.height;
        if (pixelCount > this.allowedPixelCount) {
            throw new _RequestedResizeTargetTooLargeException.default(this.request.resizeOptions, this.allowedPixelCount);
        }
    }
    constructor(){
        //8K Squared
        this.allowedPixelCount = 7680 * 4320;
        this.request = null;
    }
};
ValidateCacheImageRequestResizeTargetRule = _ts_decorate([
    (0, _common.Injectable)({
        scope: _common.Scope.REQUEST
    })
], ValidateCacheImageRequestResizeTargetRule);
