"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resourceMetaVersion = exports.defaultPublicTTL = exports.defaultPrivateTTL = void 0;
exports.defaultPrivateTTL = 6 * 30 * 24 * 60 * 60 * 1000;
exports.defaultPublicTTL = 12 * 30 * 24 * 60 * 60 * 1000;
exports.resourceMetaVersion = 1;
class ResourceMetaData {
    constructor(data) {
        this.version = data?.version ?? exports.resourceMetaVersion;
        this.publicTTL = data?.publicTTL ?? exports.defaultPublicTTL;
        this.privateTTL = data?.privateTTL ?? exports.defaultPrivateTTL;
        Object.assign(this, data);
    }
}
exports.default = ResourceMetaData;
//# sourceMappingURL=ResourceMetaData.js.map