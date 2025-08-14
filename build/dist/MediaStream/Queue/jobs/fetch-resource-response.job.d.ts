import type CacheImageRequest from '@microservice/API/dto/cache-image-request.dto';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
export default class FetchResourceResponseJob {
    private readonly _httpService;
    private readonly _logger;
    constructor(_httpService: HttpService);
    handle(request: CacheImageRequest): Promise<AxiosResponse>;
}
