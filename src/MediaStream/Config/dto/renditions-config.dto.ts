import { IsNumber, IsString, Min } from 'class-validator'

export class RenditionsConfigDto {
	// Blank disables pre-generation; a directory is not checked for existence here.
	@IsString()
	mediaDirectory!: string

	@IsString()
	cronSchedule!: string

	@IsNumber()
	@Min(1)
	minSources!: number

	@IsNumber()
	@Min(1)
	maxPerSource!: number
}
