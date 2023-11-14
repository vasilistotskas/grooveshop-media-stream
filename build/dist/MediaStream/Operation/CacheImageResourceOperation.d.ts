import { HttpService } from '@nestjs/axios';
import ResourceMetaData from '@microservice/DTO/ResourceMetaData';
import CacheImageRequest from '@microservice/API/DTO/CacheImageRequest';
import { ResourceIdentifierKP } from '@microservice/Constant/KeyProperties';
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob';
import WebpImageManipulationJob from '@microservice/Job/WebpImageManipulationJob';
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule';
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob';
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob';
export default class CacheImageResourceOperation {
    private readonly httpService;
    private readonly validateCacheImageRequest;
    private readonly fetchResourceResponseJob;
    private readonly webpImageManipulationJob;
    private readonly storeResourceResponseToFileJob;
    private readonly generateResourceIdentityFromRequestJob;
    private readonly logger;
    constructor(httpService: HttpService, validateCacheImageRequest: ValidateCacheImageRequestRule, fetchResourceResponseJob: FetchResourceResponseJob, webpImageManipulationJob: WebpImageManipulationJob, storeResourceResponseToFileJob: StoreResourceResponseToFileJob, generateResourceIdentityFromRequestJob: GenerateResourceIdentityFromRequestJob);
    request: CacheImageRequest;
    id: ResourceIdentifierKP;
    metaData: ResourceMetaData;
    get getResourcePath(): string;
    get getResourceTempPath(): string;
    get getResourceMetaPath(): string;
    get resourceExists(): boolean;
    get getHeaders(): ResourceMetaData;
    setup(cacheImageRequest: CacheImageRequest): Promise<void>;
    execute(): Promise<void>;
}
