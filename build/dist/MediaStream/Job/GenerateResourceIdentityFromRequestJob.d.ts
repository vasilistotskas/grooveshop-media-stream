import type CacheImageRequest from '@microservice/API/DTO/CacheImageRequest';
import type { ResourceIdentifierKP } from '@microservice/Constant/KeyProperties';
export default class GenerateResourceIdentityFromRequestJob {
    handle(_cacheImageRequest: CacheImageRequest): Promise<ResourceIdentifierKP>;
}
