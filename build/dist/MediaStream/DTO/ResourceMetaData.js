"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    default: function() {
        return ResourceMetaData;
    },
    defaultPrivateTTL: function() {
        return defaultPrivateTTL;
    },
    defaultPublicTTL: function() {
        return defaultPublicTTL;
    },
    resourceMetaVersion: function() {
        return resourceMetaVersion;
    }
});
const defaultPrivateTTL = 7 * 24 * 60 * 60 * 1000 // 7 days * 24 hours * 60 minutes * 60 seconds * 1000ms
;
const defaultPublicTTL = 30 * 24 * 60 * 60 * 1000 // 30 days * 24 hours * 60 minutes * 60 seconds * 1000ms
;
const resourceMetaVersion = 1;
let ResourceMetaData = class ResourceMetaData {
    constructor(data){
        if (!data.version) this.version = resourceMetaVersion;
        if (!data.publicTTL) this.publicTTL = defaultPublicTTL;
        if (!data.privateTTL) this.privateTTL = defaultPrivateTTL;
        Object.assign(this, data);
    }
};
