import { ResizeOptions } from '@microservice/API/DTO/CacheImageRequest';
export default class RequestedResizeTargetTooLargeException extends Error {
    constructor(resizeRequest: ResizeOptions, allowedPixelCount: number);
}
