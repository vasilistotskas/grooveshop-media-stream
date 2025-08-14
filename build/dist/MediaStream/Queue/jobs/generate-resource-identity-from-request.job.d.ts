import type CacheImageRequest from '@microservice/API/dto/cache-image-request.dto';
import type { ResourceIdentifierKP } from '@microservice/common/constants/key-properties.constant';
export default class GenerateResourceIdentityFromRequestJob {
    handle(cacheImageRequest: CacheImageRequest): Promise<ResourceIdentifierKP>;
}
