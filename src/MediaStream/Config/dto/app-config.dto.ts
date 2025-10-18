import { Type } from 'class-transformer'
import { ValidateNested } from 'class-validator'
import { CacheConfigDto } from './cache-config.dto.js'
import { ExternalServicesConfigDto } from './external-services-config.dto.js'
import { HttpConfigDto } from './http-config.dto.js'
import { MonitoringConfigDto } from './monitoring-config.dto.js'
import { ProcessingConfigDto } from './processing-config.dto.js'
import { RateLimitConfigDto } from './rate-limit-config.dto.js'
import { ServerConfigDto } from './server-config.dto.js'

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

	@ValidateNested()
	@Type(() => RateLimitConfigDto)
	rateLimit: RateLimitConfigDto = new RateLimitConfigDto()
}
