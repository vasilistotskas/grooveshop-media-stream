import { ConfigService } from '@microservice/Config/config.service';
import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { HttpClientService } from '../services/http-client.service';
export declare class HttpHealthIndicator extends BaseHealthIndicator {
    private readonly httpClient;
    private readonly _configService;
    private readonly healthCheckUrls;
    private readonly timeout;
    constructor(httpClient: HttpClientService, _configService: ConfigService);
    protected performHealthCheck(): Promise<HealthIndicatorResult>;
    protected getDescription(): string;
}
