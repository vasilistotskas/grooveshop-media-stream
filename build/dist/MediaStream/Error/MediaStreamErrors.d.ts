import { HttpStatus } from '@nestjs/common';
export declare class MediaStreamError extends Error {
    readonly status: HttpStatus;
    readonly code: string;
    readonly context: Record<string, any>;
    constructor(message: string, status?: HttpStatus, code?: string, context?: Record<string, any>);
    toJSON(): Record<string, any>;
}
export declare class ResourceNotFoundError extends MediaStreamError {
    constructor(message?: string, context?: Record<string, any>);
}
export declare class ResourceProcessingError extends MediaStreamError {
    constructor(message?: string, context?: Record<string, any>);
}
export declare class ResourceStreamingError extends MediaStreamError {
    constructor(message?: string, context?: Record<string, any>);
}
export declare class DefaultImageFallbackError extends MediaStreamError {
    constructor(message?: string, context?: Record<string, any>);
}
export declare class InvalidRequestError extends MediaStreamError {
    constructor(message?: string, context?: Record<string, any>);
}
