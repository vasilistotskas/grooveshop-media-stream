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
    MODULE: function() {
        return MODULE;
    },
    VERSION: function() {
        return VERSION;
    },
    IMAGE: function() {
        return IMAGE;
    }
});
const MODULE = 'media_stream';
const VERSION = '1';
const IMAGE = `${MODULE}-image`;
