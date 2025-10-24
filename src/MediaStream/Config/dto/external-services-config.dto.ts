import { Transform } from 'class-transformer'
import { IsNumber, Max, Min } from 'class-validator'

export class ExternalServicesConfigDto {
	@IsNumber()
	@Min(1000)
	@Max(300000)
	@Transform(({ value }) => Number.parseInt(value) || 30000)
	requestTimeout: number = 30000

	@IsNumber()
	@Min(0)
	@Max(10)
	@Transform(({ value }) => Number.parseInt(value) || 3)
	maxRetries: number = 3
}
