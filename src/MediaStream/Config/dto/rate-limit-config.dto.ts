import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator'

export class RateLimitThrottlerConfigDto {
	@IsNumber()
	@Min(1000)
	@Transform(({ value }) => Number.parseInt(value, 10))
	windowMs: number = 60000

	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value, 10))
	max: number = 100

	@IsBoolean()
	@IsOptional()
	@Transform(({ value }) => value === 'true')
	skipSuccessfulRequests: boolean = false

	@IsBoolean()
	@IsOptional()
	@Transform(({ value }) => value === 'true')
	skipFailedRequests: boolean = false

	constructor(data?: Partial<RateLimitThrottlerConfigDto>) {
		if (data) {
			Object.assign(this, data)
		}
	}
}

export class SystemLoadThresholdsDto {
	@IsNumber()
	@Min(0)
	@Transform(({ value }) => Number.parseFloat(value))
	cpu: number = 80

	@IsNumber()
	@Min(0)
	@Transform(({ value }) => Number.parseFloat(value))
	memory: number = 85

	@IsNumber()
	@Min(0)
	@Transform(({ value }) => Number.parseInt(value, 10))
	connections: number = 1000
}

export class AdaptiveConfigDto {
	@IsBoolean()
	@Transform(({ value }) => value === 'true')
	enabled: boolean = true

	@ValidateNested()
	@Type(() => SystemLoadThresholdsDto)
	systemLoadThresholds: SystemLoadThresholdsDto = new SystemLoadThresholdsDto()

	@IsNumber()
	@Min(0)
	@Transform(({ value }) => Number.parseFloat(value))
	maxReduction: number = 0.5

	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value, 10))
	minLimit: number = 1
}

export class BypassConfigDto {
	@IsBoolean()
	@Transform(({ value }) => value === 'true')
	healthChecks: boolean = true

	@IsBoolean()
	@Transform(({ value }) => value === 'true')
	metricsEndpoint: boolean = true

	@IsBoolean()
	@Transform(({ value }) => value === 'true')
	staticAssets: boolean = true

	@IsString({ each: true })
	@IsOptional()
	customPaths: string[] = []

	@IsString({ each: true })
	@IsOptional()
	whitelistedDomains: string[] = []
}

export class RateLimitConfigDto {
	@ValidateNested()
	@Type(() => RateLimitThrottlerConfigDto)
	default: RateLimitThrottlerConfigDto = new RateLimitThrottlerConfigDto()

	@ValidateNested()
	@Type(() => RateLimitThrottlerConfigDto)
	imageProcessing: RateLimitThrottlerConfigDto = new RateLimitThrottlerConfigDto({
		windowMs: 60000,
		max: 50,
		skipSuccessfulRequests: false,
		skipFailedRequests: false,
	})

	@ValidateNested()
	@Type(() => RateLimitThrottlerConfigDto)
	healthCheck: RateLimitThrottlerConfigDto = new RateLimitThrottlerConfigDto({
		windowMs: 10000,
		max: 1000,
		skipSuccessfulRequests: true,
		skipFailedRequests: true,
	})

	@ValidateNested()
	@Type(() => AdaptiveConfigDto)
	adaptive: AdaptiveConfigDto = new AdaptiveConfigDto()

	@ValidateNested()
	@Type(() => BypassConfigDto)
	bypass: BypassConfigDto = new BypassConfigDto()

	@IsBoolean()
	@Transform(({ value }) => value === 'true')
	enabled: boolean = true

	@IsBoolean()
	@Transform(({ value }) => value === 'true')
	logBlocked: boolean = true
}
