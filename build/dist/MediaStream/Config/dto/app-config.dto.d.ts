import { CacheConfigDto } from '@microservice/Config/dto/cache-config.dto';
import { HttpConfigDto } from '@microservice/Config/dto/http-config.dto';
import { MonitoringConfigDto } from '@microservice/Config/dto/monitoring-config.dto';
import { ProcessingConfigDto } from '@microservice/Config/dto/processing-config.dto';
import { RateLimitConfigDto } from '@microservice/Config/dto/rate-limit-config.dto';
import { ServerConfigDto } from '@microservice/Config/dto/server-config.dto';
import { ExternalServicesConfigDto } from './external-services-config.dto';
export declare class AppConfigDto {
    server: ServerConfigDto;
    cache: CacheConfigDto;
    processing: ProcessingConfigDto;
    monitoring: MonitoringConfigDto;
    externalServices: ExternalServicesConfigDto;
    http: HttpConfigDto;
    rateLimit: RateLimitConfigDto;
}
