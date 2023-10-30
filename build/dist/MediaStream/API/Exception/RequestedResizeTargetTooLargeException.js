"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return RequestedResizeTargetTooLargeException;
    }
});
var RequestedResizeTargetTooLargeException;
RequestedResizeTargetTooLargeException = class RequestedResizeTargetTooLargeException extends Error {
    constructor(resizeRequest, allowedPixelCount){
        super(`Requested resize target (${resizeRequest.width}x${resizeRequest.height}) exceeded maximum allowed size of ${allowedPixelCount} total pixels`);
    }
};
