"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return WebpImageManipulationJob;
    }
});
const _lodash = require("lodash");
const _common = require("@nestjs/common");
const _ManipulationJobResult = /*#__PURE__*/ _interop_require_default(require("../DTO/ManipulationJobResult"));
const _sharp = /*#__PURE__*/ _interop_require_default(require("sharp"));
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
let WebpImageManipulationJob = class WebpImageManipulationJob {
    async handle(filePathFrom, filePathTo, options) {
        const manipulation = (0, _sharp.default)(filePathFrom);
        switch(options.format){
            case 'jpeg':
                manipulation.jpeg({
                    quality: options.quality
                });
                break;
            case 'png':
                manipulation.png({
                    quality: options.quality
                });
                break;
            case 'webp':
                manipulation.webp({
                    quality: options.quality
                });
                break;
            case 'gif':
                manipulation.gif();
                break;
            case 'tiff':
                manipulation.tiff();
                break;
            default:
                manipulation.webp({
                    quality: options.quality
                });
        }
        const resizeScales = {};
        (0, _lodash.each)([
            'width',
            'height'
        ], (scale)=>{
            if (null !== options[scale] && !isNaN(options[scale])) {
                resizeScales[scale] = Number(options[scale]);
            }
        });
        if (Object.keys(resizeScales).length > 0) {
            if (null !== options.trimThreshold && !isNaN(options.trimThreshold)) {
                manipulation.trim({
                    background: options.background,
                    threshold: Number(options.trimThreshold)
                });
            }
            manipulation.resize({
                ...resizeScales,
                fit: options.fit,
                position: options.position,
                background: options.background
            });
        }
        const manipulatedFile = await manipulation.toFile(filePathTo);
        return new _ManipulationJobResult.default({
            size: String(manipulatedFile.size),
            format: manipulatedFile.format
        });
    }
};
WebpImageManipulationJob = _ts_decorate([
    (0, _common.Injectable)({
        scope: _common.Scope.REQUEST
    })
], WebpImageManipulationJob);
