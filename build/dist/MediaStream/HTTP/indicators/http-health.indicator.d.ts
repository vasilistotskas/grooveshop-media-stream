import { ConfigService } from '@microservice/Config/config.service';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { HttpClientService } from '../services/http-client.service';
export declare class HttpHealthIndicator extends HealthIndicator {
    private readonly httpClient;
    private readonly configService;
    private readonly healthCheckUrls;
    private readonly timeout;
    constructor(httpClient: HttpClientService, configService: ConfigService);
    isHealthy(key: string): Promise<HealthIndicatorResult>;
    getDetails(): Record<string, any>;
}
