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
    IMAGE: function() {
        return IMAGE;
    },
    MODULE: function() {
        return MODULE;
    },
    VERSION: function() {
        return VERSION;
    }
});
const MODULE = 'media_stream';
const VERSION = '1';
const IMAGE = `${MODULE}-image`;
