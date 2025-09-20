import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsNumber, Min, ValidateNested } from 'class-validator'

export class CircuitBreakerConfigDto {
	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true || false)
	enabled: boolean = false

	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value) || 5)
	failureThreshold: number = 5

	@IsNumber()
	@Min(1000)
	@Transform(({ value }) => Number.parseInt(value) || 60000)
	resetTimeout: number = 60000

	@IsNumber()
	@Min(1000)
	@Transform(({ value }) => Number.parseInt(value) || 30000)
	monitoringPeriod: number = 30000
}

export class ConnectionPoolConfigDto {
	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value) || 50)
	maxSockets: number = 50

	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value) || 10)
	maxFreeSockets: number = 10

	@IsNumber()
	@Min(100)
	@Transform(({ value }) => Number.parseInt(value) || 30000)
	timeout: number = 30000

	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true)
	keepAlive: boolean = true

	@IsNumber()
	@Min(100)
	@Transform(({ value }) => Number.parseInt(value) || 1000)
	keepAliveMsecs: number = 1000

	@IsNumber()
	@Min(100)
	@Transform(({ value }) => Number.parseInt(value) || 5000)
	connectTimeout: number = 5000
}

export class RetryConfigDto {
	@IsNumber()
	@Min(0)
	@Transform(({ value }) => Number.parseInt(value) || 3)
	retries: number = 3

	@IsNumber()
	@Min(100)
	@Transform(({ value }) => Number.parseInt(value) || 1000)
	retryDelay: number = 1000

	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value) || 2)
	retryDelayMultiplier: number = 2

	@IsNumber()
	@Min(1000)
	@Transform(({ value }) => Number.parseInt(value) || 10000)
	maxRetryDelay: number = 10000

	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true)
	retryOnTimeout: boolean = true

	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true)
	retryOnConnectionError: boolean = true
}

export class HttpConfigDto {
	@ValidateNested()
	@Type(() => CircuitBreakerConfigDto)
	circuitBreaker: CircuitBreakerConfigDto = new CircuitBreakerConfigDto()

	@ValidateNested()
	@Type(() => ConnectionPoolConfigDto)
	connectionPool: ConnectionPoolConfigDto = new ConnectionPoolConfigDto()

	@ValidateNested()
	@Type(() => RetryConfigDto)
	retry: RetryConfigDto = new RetryConfigDto()
}
