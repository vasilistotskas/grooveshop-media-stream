import type CacheImageRequest from '@microservice/API/dto/cache-image-request.dto';
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Validation/rules/validate-cache-image-request-resize-target.rule';
export default class ValidateCacheImageRequestRule {
    private readonly validateCacheImageRequestResizeTargetRule;
    constructor(validateCacheImageRequestResizeTargetRule: ValidateCacheImageRequestResizeTargetRule);
    request: CacheImageRequest;
    setup(request: CacheImageRequest): Promise<void>;
    apply(): Promise<void>;
}
