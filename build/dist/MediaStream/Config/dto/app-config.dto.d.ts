import { CacheConfigDto } from './cache-config.dto';
import { ExternalServicesConfigDto } from './external-services-config.dto';
import { HttpConfigDto } from './http-config.dto';
import { MonitoringConfigDto } from './monitoring-config.dto';
import { ProcessingConfigDto } from './processing-config.dto';
import { ServerConfigDto } from './server-config.dto';
export declare class AppConfigDto {
    server: ServerConfigDto;
    cache: CacheConfigDto;
    processing: ProcessingConfigDto;
    monitoring: MonitoringConfigDto;
    externalServices: ExternalServicesConfigDto;
    http: HttpConfigDto;
}
