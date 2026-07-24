import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsNumber, IsString, Max, Min, ValidateNested } from 'class-validator'

export class CircuitBreakerConfigDto {
	@IsBoolean()
	enabled: boolean = true

	@IsNumber()
	@Min(1)
	failureThreshold: number = 50

	@IsNumber()
	@Min(1000)
	resetTimeout: number = 30000

	@IsNumber()
	@Min(1000)
	monitoringPeriod: number = 60000

	@IsNumber()
	@Min(1)
	minimumRequests: number = 10
}

export class ConnectionPoolConfigDto {
	@IsNumber()
	@Min(1)
	maxSockets: number = 50

	@IsNumber()
	@Min(100)
	keepAliveMsecs: number = 1000
}

export class HttpHealthCheckConfigDto {
	@IsArray()
	@IsString({ each: true })
	urls: string[] = []

	@IsNumber()
	@Min(100)
	timeout: number = 5000
}

export class HttpConfigDto {
	@IsNumber()
	@Min(1000)
	@Max(300000)
	timeout: number = 30000

	@IsNumber()
	@Min(0)
	@Max(10)
	maxRetries: number = 3

	@IsNumber()
	@Min(100)
	retryDelay: number = 1000

	@IsNumber()
	@Min(1000)
	maxRetryDelay: number = 10000

	@ValidateNested()
	@Type(() => ConnectionPoolConfigDto)
	connectionPool: ConnectionPoolConfigDto = new ConnectionPoolConfigDto()

	@ValidateNested()
	@Type(() => CircuitBreakerConfigDto)
	circuitBreaker: CircuitBreakerConfigDto = new CircuitBreakerConfigDto()

	@ValidateNested()
	@Type(() => HttpHealthCheckConfigDto)
	healthCheck: HttpHealthCheckConfigDto = new HttpHealthCheckConfigDto()
}
