export var SupportedResizeFormats = /*#__PURE__*/ function(SupportedResizeFormats) {
    SupportedResizeFormats["webp"] = "webp";
    SupportedResizeFormats["jpeg"] = "jpeg";
    SupportedResizeFormats["png"] = "png";
    SupportedResizeFormats["gif"] = "gif";
    SupportedResizeFormats["tiff"] = "tiff";
    SupportedResizeFormats["svg"] = "svg";
    return SupportedResizeFormats;
}({});
export var PositionOptions = /*#__PURE__*/ function(PositionOptions) {
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
    return PositionOptions;
}({});
export var BackgroundOptions = /*#__PURE__*/ function(BackgroundOptions) {
    BackgroundOptions["white"] = "#FFFFFF";
    BackgroundOptions["black"] = "#000000";
    BackgroundOptions["transparent"] = "transparent";
    return BackgroundOptions;
}({});
export var FitOptions = /*#__PURE__*/ function(FitOptions) {
    FitOptions["contain"] = "contain";
    FitOptions["cover"] = "cover";
    FitOptions["fill"] = "fill";
    FitOptions["inside"] = "inside";
    FitOptions["outside"] = "outside";
    return FitOptions;
}({});
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
            color = color.split('').map((char)=>char + char).join('');
        }
        const num = Number.parseInt(color, 16);
        return {
            r: num >> 16,
            g: num >> 8 & 255,
            b: num & 255,
            alpha: 1
        };
    }
    return color;
}
export class ResizeOptions {
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
        this.background = background ? parseColor(String(background)) : "#FFFFFF";
        this.fit = fit ?? "contain";
        this.position = position ?? "entropy";
        this.format = format ?? "webp";
        this.quality = quality !== undefined ? Number(quality) : 80;
        Object.assign(this, rest);
        [
            'width',
            'height'
        ].forEach((sizeOption)=>{
            if (data && data[sizeOption] === null) {
                delete this[sizeOption];
            }
        });
    }
}
let CacheImageRequest = class CacheImageRequest {
    constructor(data){
        this.resourceTarget = '';
        this.resizeOptions = new ResizeOptions();
        Object.assign(this, data);
    }
};
export { CacheImageRequest as default };

//# sourceMappingURL=cache-image-request.dto.js.map