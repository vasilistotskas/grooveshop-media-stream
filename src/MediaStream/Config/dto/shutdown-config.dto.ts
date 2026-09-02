import { IsNumber, Min } from 'class-validator'

export class ShutdownConfigDto {
	@IsNumber()
	@Min(1000)
	timeout!: number

	@IsNumber()
	@Min(1000)
	forceTimeout!: number
}
