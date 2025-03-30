import type CacheImageRequest from '@microservice/API/DTO/CacheImageRequest';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
export default class FetchResourceResponseJob {
    private readonly httpService;
    private readonly logger;
    constructor(httpService: HttpService);
    handle(request: CacheImageRequest): Promise<AxiosResponse>;
}
