import ValidateCacheImageRequestResizeTargetRule from '@microservice/Rule/ValidateCacheImageRequestResizeTargetRule';
import type CacheImageRequest from '@microservice/API/DTO/CacheImageRequest';
export default class ValidateCacheImageRequestRule {
    private readonly validateCacheImageRequestResizeTargetRule;
    constructor(validateCacheImageRequestResizeTargetRule: ValidateCacheImageRequestResizeTargetRule);
    request: CacheImageRequest;
    setup(request: CacheImageRequest): Promise<void>;
    apply(): Promise<void>;
}
