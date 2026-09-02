import { Type } from 'class-transformer'
import { IsDefined, ValidateNested } from 'class-validator'
import { AdminConfigDto } from './admin-config.dto.js'
import { BackendConfigDto } from './backend-config.dto.js'
import { CacheConfigDto } from './cache-config.dto.js'
import { HttpConfigDto } from './http-config.dto.js'
import { MonitoringConfigDto } from './monitoring-config.dto.js'
import { ProcessingConfigDto } from './processing-config.dto.js'
import { RateLimitConfigDto } from './rate-limit-config.dto.js'
import { ServerConfigDto } from './server-config.dto.js'
import { ShutdownConfigDto } from './shutdown-config.dto.js'
import { StorageConfigDto } from './storage-config.dto.js'
import { TenantDomainsConfigDto } from './tenant-domains-config.dto.js'
import { ValidationConfigDto } from './validation-config.dto.js'

/**
 * Constraint layer over the schema-built config. Values (and defaults) come
 * exclusively from APP_CONFIG_SCHEMA; a field declared here without a schema
 * entry fails validation at startup, which is the intended contract.
 */
export class AppConfigDto {
	@IsDefined()
	@ValidateNested()
	@Type(() => ServerConfigDto)
	server!: ServerConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => BackendConfigDto)
	backend!: BackendConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => AdminConfigDto)
	admin!: AdminConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => CacheConfigDto)
	cache!: CacheConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => ProcessingConfigDto)
	processing!: ProcessingConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => MonitoringConfigDto)
	monitoring!: MonitoringConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => HttpConfigDto)
	http!: HttpConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => RateLimitConfigDto)
	rateLimit!: RateLimitConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => ValidationConfigDto)
	validation!: ValidationConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => TenantDomainsConfigDto)
	tenantDomains!: TenantDomainsConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => StorageConfigDto)
	storage!: StorageConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => ShutdownConfigDto)
	shutdown!: ShutdownConfigDto
}
