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
    BackgroundOptions: function() {
        return BackgroundOptions;
    },
    FitOptions: function() {
        return FitOptions;
    },
    PositionOptions: function() {
        return PositionOptions;
    },
    ResizeOptions: function() {
        return ResizeOptions;
    },
    SupportedResizeFormats: function() {
        return SupportedResizeFormats;
    },
    default: function() {
        return CacheImageRequest;
    }
});
const _lodash = require("lodash");
var SupportedResizeFormats;
(function(SupportedResizeFormats) {
    SupportedResizeFormats["webp"] = "webp";
    SupportedResizeFormats["jpeg"] = "jpeg";
    SupportedResizeFormats["png"] = "png";
    SupportedResizeFormats["gif"] = "gif";
    SupportedResizeFormats["tiff"] = "tiff";
})(SupportedResizeFormats || (SupportedResizeFormats = {}));
var PositionOptions;
(function(PositionOptions) {
    PositionOptions["centre"] = "centre";
    PositionOptions["center"] = "center";
    PositionOptions["left"] = "left";
    PositionOptions["right"] = "right";
    PositionOptions["top"] = "top";
    PositionOptions["bottom"] = "bottom";
    PositionOptions["west"] = "west";
    PositionOptions["east"] = "east";
    PositionOptions["north"] = "north";
    PositionOptions["south"] = "south";
    PositionOptions["northwest"] = "northwest";
    PositionOptions["northeast"] = "northeast";
    PositionOptions["southwest"] = "southwest";
    PositionOptions["southeast"] = "southeast";
    PositionOptions["entropy"] = "entropy";
    PositionOptions["attention"] = "attention";
})(PositionOptions || (PositionOptions = {}));
var BackgroundOptions;
(function(BackgroundOptions) {
    BackgroundOptions["white"] = "#FFFFFF";
    BackgroundOptions["black"] = "#000000";
    BackgroundOptions["transparent"] = "transparent";
})(BackgroundOptions || (BackgroundOptions = {}));
var FitOptions;
(function(FitOptions) {
    FitOptions["contain"] = "contain";
    FitOptions["cover"] = "cover";
    FitOptions["fill"] = "fill";
    FitOptions["inside"] = "inside";
    FitOptions["outside"] = "outside";
})(FitOptions || (FitOptions = {}));
function parseColor(color) {
    // Convert the background property from a hex color string to an RGBA color object
    if (typeof color === 'string') {
        if (color === 'transparent') {
            return {
                r: 0,
                g: 0,
                b: 0,
                alpha: 0
            };
        }
        if (color[0] === '#') {
            color = color.slice(1);
        }
        if (color.length === 3) {
            color = color.split('').map(function(char) {
                return char + char;
            }).join('');
        }
        const num = parseInt(color, 16);
        const colorToRgba = {
            r: num >> 16,
            g: num >> 8 & 255,
            b: num & 255,
            alpha: 1
        };
        return colorToRgba;
    }
    return color;
}
let ResizeOptions = class ResizeOptions {
    constructor(data){
        this.width = null;
        this.height = null;
        this.fit = "contain";
        this.position = "entropy";
        this.format = "webp";
        this.background = "#FFFFFF";
        this.trimThreshold = null;
        this.quality = 80;
        const { width, height, trimThreshold, background, fit, position, format, quality, ...rest } = data || {};
        this.width = width ?? null;
        this.height = height ?? null;
        this.trimThreshold = trimThreshold ? Number(trimThreshold) : null;
        this.background = typeof background === 'string' ? parseColor(background) : background;
        this.fit = fit ?? "contain";
        this.position = position ?? "entropy";
        this.format = format ?? "webp";
        this.quality = quality ?? 80;
        Object.assign(this, rest);
        (0, _lodash.each)([
            'width',
            'height'
        ], (sizeOption)=>{
            if (null === data[sizeOption]) delete this[sizeOption];
        });
    }
};
var CacheImageRequest;
CacheImageRequest = class CacheImageRequest {
    constructor(data){
        Object.assign(this, data);
    }
};
