"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidRequestError = exports.DefaultImageFallbackError = exports.ResourceStreamingError = exports.ResourceProcessingError = exports.ResourceNotFoundError = exports.MediaStreamError = void 0;
const common_1 = require("@nestjs/common");
class MediaStreamError extends Error {
    constructor(message, status = common_1.HttpStatus.INTERNAL_SERVER_ERROR, code = 'MEDIA_STREAM_ERROR', context = {}) {
        super(message);
        this.name = this.constructor.name;
        this.status = status;
        this.code = code;
        this.context = context;
        Error.captureStackTrace(this, this.constructor);
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            status: this.status,
            code: this.code,
            context: this.context,
            stack: this.stack,
        };
    }
}
exports.MediaStreamError = MediaStreamError;
class ResourceNotFoundError extends MediaStreamError {
    constructor(message = 'Resource not found', context = {}) {
        super(message, common_1.HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', context);
    }
}
exports.ResourceNotFoundError = ResourceNotFoundError;
class ResourceProcessingError extends MediaStreamError {
    constructor(message = 'Failed to process resource', context = {}) {
        super(message, common_1.HttpStatus.INTERNAL_SERVER_ERROR, 'RESOURCE_PROCESSING_ERROR', context);
    }
}
exports.ResourceProcessingError = ResourceProcessingError;
class ResourceStreamingError extends MediaStreamError {
    constructor(message = 'Failed to stream resource', context = {}) {
        super(message, common_1.HttpStatus.INTERNAL_SERVER_ERROR, 'RESOURCE_STREAMING_ERROR', context);
    }
}
exports.ResourceStreamingError = ResourceStreamingError;
class DefaultImageFallbackError extends MediaStreamError {
    constructor(message = 'Failed to serve default image', context = {}) {
        super(message, common_1.HttpStatus.INTERNAL_SERVER_ERROR, 'DEFAULT_IMAGE_FALLBACK_ERROR', context);
    }
}
exports.DefaultImageFallbackError = DefaultImageFallbackError;
class InvalidRequestError extends MediaStreamError {
    constructor(message = 'Invalid request parameters', context = {}) {
        super(message, common_1.HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', context);
    }
}
exports.InvalidRequestError = InvalidRequestError;
//# sourceMappingURL=media-stream.errors.js.map