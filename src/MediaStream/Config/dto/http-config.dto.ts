import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsDefined, IsNumber, IsString, Max, Min, ValidateNested } from 'class-validator'

export class CircuitBreakerConfigDto {
	@IsBoolean()
	enabled!: boolean

	@IsNumber()
	@Min(1)
	failureThreshold!: number

	@IsNumber()
	@Min(1000)
	resetTimeout!: number

	@IsNumber()
	@Min(1000)
	monitoringPeriod!: number

	@IsNumber()
	@Min(1)
	minimumRequests!: number
}

export class ConnectionPoolConfigDto {
	@IsNumber()
	@Min(1)
	maxSockets!: number

	@IsNumber()
	@Min(100)
	keepAliveMsecs!: number
}

export class HttpHealthCheckConfigDto {
	@IsArray()
	@IsString({ each: true })
	urls!: string[]

	@IsNumber()
	@Min(100)
	timeout!: number
}

export class HttpConfigDto {
	@IsNumber()
	@Min(1000)
	@Max(300000)
	timeout!: number

	@IsNumber()
	@Min(0)
	@Max(10)
	maxRetries!: number

	@IsNumber()
	@Min(100)
	retryDelay!: number

	@IsNumber()
	@Min(1000)
	maxRetryDelay!: number

	@IsDefined()
	@ValidateNested()
	@Type(() => ConnectionPoolConfigDto)
	connectionPool!: ConnectionPoolConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => CircuitBreakerConfigDto)
	circuitBreaker!: CircuitBreakerConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => HttpHealthCheckConfigDto)
	healthCheck!: HttpHealthCheckConfigDto
}
