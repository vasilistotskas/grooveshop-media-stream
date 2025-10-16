import { CacheConfigDto } from '#microservice/Config/dto/cache-config.dto'
import { HttpConfigDto } from '#microservice/Config/dto/http-config.dto'
import { MonitoringConfigDto } from '#microservice/Config/dto/monitoring-config.dto'
import { ProcessingConfigDto } from '#microservice/Config/dto/processing-config.dto'
import { RateLimitConfigDto } from '#microservice/Config/dto/rate-limit-config.dto'
import { ServerConfigDto } from '#microservice/Config/dto/server-config.dto'
import { Type } from 'class-transformer'
import { ValidateNested } from 'class-validator'
import { ExternalServicesConfigDto } from './external-services-config.dto'

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
