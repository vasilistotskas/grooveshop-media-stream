import { AxiosResponse } from 'axios';
import { HttpService } from '@nestjs/axios';
import CacheImageRequest from '@microservice/API/DTO/CacheImageRequest';
export default class FetchResourceResponseJob {
    private readonly httpService;
    constructor(httpService: HttpService);
    handle(request: CacheImageRequest): Promise<AxiosResponse>;
}
