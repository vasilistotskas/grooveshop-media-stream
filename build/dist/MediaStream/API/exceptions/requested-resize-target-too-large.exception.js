export default class RequestedResizeTargetTooLargeException extends Error {
    constructor(resizeRequest, allowedPixelCount){
        super(`Requested resize target (${resizeRequest.width}x${resizeRequest.height}) exceeded maximum allowed size of ${allowedPixelCount} total pixels`);
    }
}

//# sourceMappingURL=requested-resize-target-too-large.exception.js.map