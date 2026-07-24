import { IsNumber, Max, Min } from 'class-validator'

export class ProcessingConfigDto {
	@IsNumber()
	@Min(0.1)
	@Max(64)
	cpuCores: number = 1.5
}
