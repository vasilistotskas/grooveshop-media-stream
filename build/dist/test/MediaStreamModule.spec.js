"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _testing = require("@nestjs/testing");
const _MediaStreamImageRESTController = /*#__PURE__*/ _interop_require_default(require("../MediaStream/API/Controller/MediaStreamImageRESTController"));
const _axios = require("@nestjs/axios");
const _GenerateResourceIdentityFromRequestJob = /*#__PURE__*/ _interop_require_default(require("../MediaStream/Job/GenerateResourceIdentityFromRequestJob"));
const _CacheImageResourceOperation = /*#__PURE__*/ _interop_require_default(require("../MediaStream/Operation/CacheImageResourceOperation"));
const _FetchResourceResponseJob = /*#__PURE__*/ _interop_require_default(require("../MediaStream/Job/FetchResourceResponseJob"));
const _WebpImageManipulationJob = /*#__PURE__*/ _interop_require_default(require("../MediaStream/Job/WebpImageManipulationJob"));
const _StoreResourceResponseToFileJob = /*#__PURE__*/ _interop_require_default(require("../MediaStream/Job/StoreResourceResponseToFileJob"));
const _ValidateCacheImageRequestRule = /*#__PURE__*/ _interop_require_default(require("../MediaStream/Rule/ValidateCacheImageRequestRule"));
const _ValidateCacheImageRequestResizeTargetRule = /*#__PURE__*/ _interop_require_default(require("../MediaStream/Rule/ValidateCacheImageRequestResizeTargetRule"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
describe('MediaStreamModule', ()=>{
    let module;
    let controller;
    beforeEach(async ()=>{
        module = await _testing.Test.createTestingModule({
            controllers: [
                _MediaStreamImageRESTController.default
            ],
            providers: [
                {
                    provide: _axios.HttpService,
                    useValue: {}
                },
                _GenerateResourceIdentityFromRequestJob.default,
                _CacheImageResourceOperation.default,
                _FetchResourceResponseJob.default,
                _WebpImageManipulationJob.default,
                _StoreResourceResponseToFileJob.default,
                _ValidateCacheImageRequestRule.default,
                _ValidateCacheImageRequestResizeTargetRule.default
            ]
        }).compile();
        controller = await module.resolve(_MediaStreamImageRESTController.default);
    });
    it('should be defined', ()=>{
        expect(controller).toBeDefined();
    });
});

//# sourceMappingURL=MediaStreamModule.spec.js.map