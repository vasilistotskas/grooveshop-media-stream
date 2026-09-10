import { IsInt, IsNumber, Max, Min } from 'class-validator'

export class ProcessingConfigDto {
	@IsNumber()
	@Min(0.1)
	@Max(64)
	cpuCores!: number

	@IsInt()
	@Min(0)
	@Max(64)
	maxConcurrent!: number

	@IsInt()
	@Min(0)
	@Max(10000)
	maxQueue!: number

	@IsInt()
	@Min(0)
	@Max(600000)
	queueTimeoutMs!: number

	@IsInt()
	@Min(0)
	@Max(600)
	timeoutSeconds!: number
}
