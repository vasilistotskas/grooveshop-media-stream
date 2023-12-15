import CacheImageRequest from '@microservice/API/DTO/CacheImageRequest';
import { ResourceIdentifierKP } from '@microservice/Constant/KeyProperties';
export default class GenerateResourceIdentityFromRequestJob {
    handle(cacheImageRequest: CacheImageRequest): Promise<ResourceIdentifierKP>;
}
