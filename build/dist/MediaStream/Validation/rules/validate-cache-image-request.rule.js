function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import ValidateCacheImageRequestResizeTargetRule from "./validate-cache-image-request-resize-target.rule.js";
import { Injectable, Scope } from "@nestjs/common";
export default class ValidateCacheImageRequestRule {
    constructor(validateCacheImageRequestResizeTargetRule){
        this.validateCacheImageRequestResizeTargetRule = validateCacheImageRequestResizeTargetRule;
    }
    async setup(request) {
        this.request = request;
        await this.validateCacheImageRequestResizeTargetRule.setup(request);
    }
    async apply() {
        await this.validateCacheImageRequestResizeTargetRule.apply();
    }
}
ValidateCacheImageRequestRule = _ts_decorate([
    Injectable({
        scope: Scope.REQUEST
    }),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ValidateCacheImageRequestResizeTargetRule === "undefined" ? Object : ValidateCacheImageRequestResizeTargetRule
    ])
], ValidateCacheImageRequestRule);

//# sourceMappingURL=validate-cache-image-request.rule.js.map