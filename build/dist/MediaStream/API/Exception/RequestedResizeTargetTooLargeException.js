"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class RequestedResizeTargetTooLargeException extends Error {
    constructor(resizeRequest, allowedPixelCount) {
        super(`Requested resize target (${resizeRequest.width}x${resizeRequest.height}) exceeded maximum allowed size of ${allowedPixelCount} total pixels`);
    }
}
exports.default = RequestedResizeTargetTooLargeException;
//# sourceMappingURL=RequestedResizeTargetTooLargeException.js.map