import { Type } from 'class-transformer'
import { IsArray, IsDefined, IsNumber, IsString, Matches, Min, ValidateNested } from 'class-validator'

export class RenditionStoreConfigDto {
	// Blank disables the store; the endpoint is not validated as a URL here.
	@IsString()
	endpoint!: string

	@IsString()
	bucket!: string

	@IsString()
	accessKeyId!: string

	@IsString()
	secretAccessKey!: string

	@IsNumber()
	@Min(100)
	readTimeoutMs!: number

	@IsNumber()
	@Min(100)
	writeTimeoutMs!: number
}

export class RenditionSizesConfigDto {
	@IsNumber()
	@Min(1)
	minSources!: number

	@IsNumber()
	@Min(1)
	windowDays!: number

	@IsNumber()
	@Min(1)
	maxKnown!: number

	// Both axes set: a contract size names the box the metadata states. The
	// width and height caps and the pixel budget are checked by RenditionSizeService.
	@IsArray()
	@Matches(/^[1-9]\d*x[1-9]\d*$/, { each: true })
	contract!: string[]
}

export class RenditionsConfigDto {
	@IsDefined()
	@ValidateNested()
	@Type(() => RenditionStoreConfigDto)
	store!: RenditionStoreConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => RenditionSizesConfigDto)
	sizes!: RenditionSizesConfigDto

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
