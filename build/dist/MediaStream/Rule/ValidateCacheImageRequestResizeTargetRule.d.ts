import type CacheImageRequest from '@microservice/API/DTO/CacheImageRequest';
export default class ValidateCacheImageRequestResizeTargetRule {
    allowedPixelCount: number;
    request: CacheImageRequest;
    setup(request: CacheImageRequest): Promise<void>;
    apply(): Promise<void>;
}
