import { IsNumber, Min } from 'class-validator'

export class ShutdownConfigDto {
	@IsNumber()
	@Min(1000)
	timeout: number = 30000

	@IsNumber()
	@Min(1000)
	forceTimeout: number = 60000
}
