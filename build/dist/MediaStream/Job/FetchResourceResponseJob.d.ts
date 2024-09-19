import type CacheImageRequest from '@microservice/API/DTO/CacheImageRequest';
import type { AxiosResponse } from 'axios';
import { HttpService } from '@nestjs/axios';
export default class FetchResourceResponseJob {
    private readonly httpService;
    private readonly logger;
    constructor(httpService: HttpService);
    handle(request: CacheImageRequest): Promise<AxiosResponse>;
}
