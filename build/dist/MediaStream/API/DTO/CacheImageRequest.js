"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResizeOptions = exports.FitOptions = exports.BackgroundOptions = exports.PositionOptions = exports.SupportedResizeFormats = void 0;
const lodash_1 = require("lodash");
var SupportedResizeFormats;
(function (SupportedResizeFormats) {
    SupportedResizeFormats["webp"] = "webp";
    SupportedResizeFormats["jpeg"] = "jpeg";
    SupportedResizeFormats["png"] = "png";
    SupportedResizeFormats["gif"] = "gif";
    SupportedResizeFormats["tiff"] = "tiff";
})(SupportedResizeFormats || (exports.SupportedResizeFormats = SupportedResizeFormats = {}));
var PositionOptions;
(function (PositionOptions) {
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
})(PositionOptions || (exports.PositionOptions = PositionOptions = {}));
var BackgroundOptions;
(function (BackgroundOptions) {
    BackgroundOptions["white"] = "#FFFFFF";
    BackgroundOptions["black"] = "#000000";
    BackgroundOptions["transparent"] = "transparent";
})(BackgroundOptions || (exports.BackgroundOptions = BackgroundOptions = {}));
var FitOptions;
(function (FitOptions) {
    FitOptions["contain"] = "contain";
    FitOptions["cover"] = "cover";
    FitOptions["fill"] = "fill";
    FitOptions["inside"] = "inside";
    FitOptions["outside"] = "outside";
})(FitOptions || (exports.FitOptions = FitOptions = {}));
function parseColor(color) {
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
            color = color
                .split('')
                .map(function (char) {
                return char + char;
            })
                .join('');
        }
        const num = parseInt(color, 16);
        const colorToRgba = {
            r: num >> 16,
            g: (num >> 8) & 255,
            b: num & 255,
            alpha: 1
        };
        return colorToRgba;
    }
    return color;
}
class ResizeOptions {
    constructor(data) {
        this.width = null;
        this.height = null;
        this.fit = FitOptions.contain;
        this.position = PositionOptions.entropy;
        this.format = SupportedResizeFormats.webp;
        this.background = BackgroundOptions.white;
        this.trimThreshold = null;
        this.quality = 100;
        const { width, height, trimThreshold, background, fit, position, format, quality, ...rest } = data || {};
        this.width = width ?? null;
        this.height = height ?? null;
        this.trimThreshold = trimThreshold ? Number(trimThreshold) : null;
        this.background = typeof background === 'string' ? parseColor(background) : background;
        this.fit = fit ?? FitOptions.contain;
        this.position = position ?? PositionOptions.entropy;
        this.format = format ?? SupportedResizeFormats.webp;
        this.quality = Number(quality) ?? 100;
        Object.assign(this, rest);
        (0, lodash_1.each)(['width', 'height'], (sizeOption) => {
            if (null === data[sizeOption])
                delete this[sizeOption];
        });
    }
}
exports.ResizeOptions = ResizeOptions;
class CacheImageRequest {
    constructor(data) {
        Object.assign(this, data);
    }
}
exports.default = CacheImageRequest;
//# sourceMappingURL=CacheImageRequest.js.map