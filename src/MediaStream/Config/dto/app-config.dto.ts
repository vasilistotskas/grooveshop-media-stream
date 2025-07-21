import { Type } from 'class-transformer'
import { ValidateNested } from 'class-validator'
import { CacheConfigDto } from './cache-config.dto'
import { ExternalServicesConfigDto } from './external-services-config.dto'
import { HttpConfigDto } from './http-config.dto'
import { MonitoringConfigDto } from './monitoring-config.dto'
import { ProcessingConfigDto } from './processing-config.dto'
import { ServerConfigDto } from './server-config.dto'

export class AppConfigDto {
	@ValidateNested()
	@Type(() => ServerConfigDto)
	server: ServerConfigDto = new ServerConfigDto()

	@ValidateNested()
	@Type(() => CacheConfigDto)
	cache: CacheConfigDto = new CacheConfigDto()

	@ValidateNested()
	@Type(() => ProcessingConfigDto)
	processing: ProcessingConfigDto = new ProcessingConfigDto()

	@ValidateNested()
	@Type(() => MonitoringConfigDto)
	monitoring: MonitoringConfigDto = new MonitoringConfigDto()

	@ValidateNested()
	@Type(() => ExternalServicesConfigDto)
	externalServices: ExternalServicesConfigDto = new ExternalServicesConfigDto()

	@ValidateNested()
	@Type(() => HttpConfigDto)
	http: HttpConfigDto = new HttpConfigDto()
}
