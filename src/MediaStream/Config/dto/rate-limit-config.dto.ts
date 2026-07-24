import { Type } from 'class-transformer'
import { IsBoolean, IsNumber, IsString, Min, ValidateNested } from 'class-validator'

export class RateLimitThrottlerConfigDto {
	@IsNumber()
	@Min(1000)
	windowMs: number = 60000

	@IsNumber()
	@Min(1)
	max: number = 100

	constructor(data?: Partial<RateLimitThrottlerConfigDto>) {
		if (data) {
			Object.assign(this, data)
		}
	}
}

export class BypassConfigDto {
	@IsBoolean()
	healthChecks: boolean = true

	@IsBoolean()
	staticAssets: boolean = true

	@IsBoolean()
	bots: boolean = true

	// Comma-separated domain list; parsed by RateLimitService.getWhitelistedDomains()
	@IsString()
	whitelistedDomains: string = ''
}

export class RateLimitConfigDto {
	@IsBoolean()
	enabled: boolean = true

	@ValidateNested()
	@Type(() => RateLimitThrottlerConfigDto)
	default: RateLimitThrottlerConfigDto = new RateLimitThrottlerConfigDto()

	@ValidateNested()
	@Type(() => RateLimitThrottlerConfigDto)
	imageProcessing: RateLimitThrottlerConfigDto = new RateLimitThrottlerConfigDto({
		windowMs: 60000,
		max: 50,
	})

	@ValidateNested()
	@Type(() => RateLimitThrottlerConfigDto)
	healthCheck: RateLimitThrottlerConfigDto = new RateLimitThrottlerConfigDto({
		windowMs: 10000,
		max: 1000,
	})

	@ValidateNested()
	@Type(() => BypassConfigDto)
	bypass: BypassConfigDto = new BypassConfigDto()
}
