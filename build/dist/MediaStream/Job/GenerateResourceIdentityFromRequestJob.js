"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return GenerateResourceIdentityFromRequestJob;
    }
});
const _uuid = require("uuid");
const _lodash = require("lodash");
const _common = require("@nestjs/common");
function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
var GenerateResourceIdentityFromRequestJob;
GenerateResourceIdentityFromRequestJob = class GenerateResourceIdentityFromRequestJob {
    async handle(cacheImageRequest) {
        const request = (0, _lodash.cloneDeep)(cacheImageRequest);
        return (0, _uuid.v5)(JSON.stringify(request), _uuid.v5.URL);
    }
};
GenerateResourceIdentityFromRequestJob = _ts_decorate([
    (0, _common.Injectable)({
        scope: _common.Scope.REQUEST
    })
], GenerateResourceIdentityFromRequestJob);
