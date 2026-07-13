import { IsNumber, Max, Min } from 'class-validator'

export class ExternalServicesConfigDto {
	@IsNumber()
	@Min(1000)
	@Max(300000)
	requestTimeout: number = 30000
}
