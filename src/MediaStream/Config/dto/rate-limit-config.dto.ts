import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsDefined, IsNumber, IsString, Min, ValidateNested } from 'class-validator'

export class RateLimitBucketConfigDto {
	@IsNumber()
	@Min(1000)
	windowMs!: number

	@IsNumber()
	@Min(1)
	max!: number
}

export class BypassConfigDto {
	@IsBoolean()
	healthChecks!: boolean

	@IsBoolean()
	staticAssets!: boolean

	@IsBoolean()
	bots!: boolean

	@IsArray()
	@IsString({ each: true })
	whitelistedDomains!: string[]
}

export class RateLimitConfigDto {
	@IsBoolean()
	enabled!: boolean

	@IsDefined()
	@ValidateNested()
	@Type(() => RateLimitBucketConfigDto)
	default!: RateLimitBucketConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => RateLimitBucketConfigDto)
	imageProcessing!: RateLimitBucketConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => RateLimitBucketConfigDto)
	healthCheck!: RateLimitBucketConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => BypassConfigDto)
	bypass!: BypassConfigDto
}
