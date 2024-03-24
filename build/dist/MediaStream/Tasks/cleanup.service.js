"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "CleanupService", {
    enumerable: true,
    get: function() {
        return CleanupService;
    }
});
const _common = require("@nestjs/common");
const _schedule = require("@nestjs/schedule");
const _promises = /*#__PURE__*/ _interop_require_wildcard(require("node:fs/promises"));
const _path = /*#__PURE__*/ _interop_require_wildcard(require("path"));
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
    var newObj = {
        __proto__: null
    };
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
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
let CleanupService = class CleanupService {
    async handleCleanup() {
        const projectRoot = process.cwd();
        const directoryPath = _path.join(projectRoot, 'storage');
        let deletedFilesCount = 0;
        try {
            const files = await _promises.readdir(directoryPath);
            for (const file of files){
                if (file.endsWith('.rst') || file.endsWith('.rsc') || file.endsWith('.rsm') || file.endsWith('.webp')) {
                    await _promises.unlink(_path.join(directoryPath, file));
                    deletedFilesCount++;
                }
            }
            this.logger.log(`${deletedFilesCount} files deleted.`);
        } catch (err) {
            this.logger.error(`Error during cleanup: ${err}`);
        }
    }
    constructor(){
        this.logger = new _common.Logger(CleanupService.name);
    }
};
_ts_decorate([
    (0, _schedule.Cron)(_schedule.CronExpression.EVERY_WEEK, {
        name: 'cleanup'
    }),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], CleanupService.prototype, "handleCleanup", null);
CleanupService = _ts_decorate([
    (0, _common.Injectable)()
], CleanupService);

//# sourceMappingURL=cleanup.service.js.map