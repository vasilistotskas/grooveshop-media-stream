import type CacheImageRequest from '@microservice/API/dto/cache-image-request.dto';
export default class ValidateCacheImageRequestResizeTargetRule {
    allowedPixelCount: number;
    request: CacheImageRequest;
    setup(request: CacheImageRequest): Promise<void>;
    apply(): Promise<void>;
}
