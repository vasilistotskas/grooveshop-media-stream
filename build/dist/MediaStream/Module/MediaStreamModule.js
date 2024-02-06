"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return MediaStreamModule;
    }
});
const _common = require("@nestjs/common");
const _axios = require("@nestjs/axios");
const _FetchResourceResponseJob = /*#__PURE__*/ _interop_require_default(require("../Job/FetchResourceResponseJob"));
const _WebpImageManipulationJob = /*#__PURE__*/ _interop_require_default(require("../Job/WebpImageManipulationJob"));
const _ValidateCacheImageRequestRule = /*#__PURE__*/ _interop_require_default(require("../Rule/ValidateCacheImageRequestRule"));
const _StoreResourceResponseToFileJob = /*#__PURE__*/ _interop_require_default(require("../Job/StoreResourceResponseToFileJob"));
const _CacheImageResourceOperation = /*#__PURE__*/ _interop_require_default(require("../Operation/CacheImageResourceOperation"));
const _MediaStreamImageRESTController = /*#__PURE__*/ _interop_require_default(require("../API/Controller/MediaStreamImageRESTController"));
const _GenerateResourceIdentityFromRequestJob = /*#__PURE__*/ _interop_require_default(require("../Job/GenerateResourceIdentityFromRequestJob"));
const _ValidateCacheImageRequestResizeTargetRule = /*#__PURE__*/ _interop_require_default(require("../Rule/ValidateCacheImageRequestResizeTargetRule"));
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
const controllers = [
    _MediaStreamImageRESTController.default
];
const operations = [
    _CacheImageResourceOperation.default
];
const jobs = [
    _GenerateResourceIdentityFromRequestJob.default,
    _FetchResourceResponseJob.default,
    _StoreResourceResponseToFileJob.default,
    _WebpImageManipulationJob.default
];
const rules = [
    _ValidateCacheImageRequestRule.default,
    _ValidateCacheImageRequestResizeTargetRule.default
];
let MediaStreamModule = class MediaStreamModule {
};
MediaStreamModule = _ts_decorate([
    (0, _common.Module)({
        imports: [
            _axios.HttpModule
        ],
        controllers,
        providers: [
            ...jobs,
            ...rules,
            ...operations
        ]
    })
], MediaStreamModule);

//# sourceMappingURL=MediaStreamModule.js.map