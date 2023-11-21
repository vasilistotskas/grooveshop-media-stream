"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return ValidateCacheImageRequestRule;
    }
});
const _common = require("@nestjs/common");
const _ValidateCacheImageRequestResizeTargetRule = /*#__PURE__*/ _interop_require_default(require("./ValidateCacheImageRequestResizeTargetRule"));
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
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
let ValidateCacheImageRequestRule = class ValidateCacheImageRequestRule {
    async setup(request) {
        this.request = request;
        await this.validateCacheImageRequestResizeTargetRule.setup(request);
    }
    async apply() {
        await this.validateCacheImageRequestResizeTargetRule.apply();
    }
    constructor(validateCacheImageRequestResizeTargetRule){
        this.validateCacheImageRequestResizeTargetRule = validateCacheImageRequestResizeTargetRule;
        this.request = null;
    }
};
ValidateCacheImageRequestRule = _ts_decorate([
    (0, _common.Injectable)({
        scope: _common.Scope.REQUEST
    }),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _ValidateCacheImageRequestResizeTargetRule.default === "undefined" ? Object : _ValidateCacheImageRequestResizeTargetRule.default
    ])
], ValidateCacheImageRequestRule);
