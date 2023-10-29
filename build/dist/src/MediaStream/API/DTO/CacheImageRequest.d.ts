interface RGBA {
    r?: number | undefined;
    g?: number | undefined;
    b?: number | undefined;
    alpha?: number | undefined;
}
type Color = string | RGBA;
export declare enum SupportedResizeFormats {
    webp = "webp",
    jpeg = "jpeg",
    png = "png",
    gif = "gif",
    tiff = "tiff"
}
export declare enum PositionOptions {
    centre = "centre",
    center = "center",
    left = "left",
    right = "right",
    top = "top",
    bottom = "bottom",
    west = "west",
    east = "east",
    north = "north",
    south = "south",
    northwest = "northwest",
    northeast = "northeast",
    southwest = "southwest",
    southeast = "southeast",
    entropy = "entropy",
    attention = "attention"
}
export declare enum BackgroundOptions {
    white = "#FFFFFF",
    black = "#000000",
    transparent = "transparent"
}
export declare enum FitOptions {
    contain = "contain",
    cover = "cover",
    fill = "fill",
    inside = "inside",
    outside = "outside"
}
export declare class ResizeOptions {
    width: number;
    height: number;
    fit: FitOptions;
    position: PositionOptions | string;
    format: SupportedResizeFormats;
    background: Color;
    trimThreshold: null | number;
    quality: number;
    constructor(data?: Partial<ResizeOptions>);
}
export default class CacheImageRequest {
    resourceTarget: string;
    ttl?: number;
    resizeOptions: ResizeOptions;
    constructor(data?: Partial<CacheImageRequest>);
}
export {};
