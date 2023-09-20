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
const _sharp = /*#__PURE__*/ _interop_require_wildcard(require("sharp"));
const _common = require("@nestjs/common");
const _ManipulationJobResult = /*#__PURE__*/ _interop_require_default(require("../DTO/ManipulationJobResult"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function _getRequireWildcardCache(nodeInterop) {
    if (typeof WeakMap !== "function") return null;
    var cacheBabelInterop = new WeakMap();
    var cacheNodeInterop = new WeakMap();
    return (_getRequireWildcardCache = function(nodeInterop) {
        return nodeInterop ? cacheNodeInterop : cacheBabelInterop;
    })(nodeInterop);
}
function _interop_require_wildcard(obj, nodeInterop) {
    if (!nodeInterop && obj && obj.__esModule) {
        return obj;
    }
    if (obj === null || typeof obj !== "object" && typeof obj !== "function") {
        return {
            default: obj
        };
    }
    var cache = _getRequireWildcardCache(nodeInterop);
    if (cache && cache.has(obj)) {
        return cache.get(obj);
    }
    var newObj = {};
    var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for(var key in obj){
        if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) {
            var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
            if (desc && (desc.get || desc.set)) {
                Object.defineProperty(newObj, key, desc);
            } else {
                newObj[key] = obj[key];
            }
        }
    }
    newObj.default = obj;
    if (cache) {
        cache.set(obj, newObj);
    }
    return newObj;
}
function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
let WebpImageManipulationJob = class WebpImageManipulationJob {
    async handle(filePathFrom, filePathTo, options) {
        const manipulation = _sharp(filePathFrom);
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
                manipulation.trim(options.trimThreshold);
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
