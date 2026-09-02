import { Type } from 'class-transformer'
import { IsBoolean, IsDefined, IsNumber, IsString, Min, ValidateNested } from 'class-validator'

export class StorageCleanupConfigDto {
	@IsBoolean()
	enabled!: boolean

	@IsString()
	cronSchedule!: string

	@IsBoolean()
	dryRun!: boolean

	@IsNumber()
	@Min(1000)
	maxDuration!: number
}

export class StorageEvictionConfigDto {
	@IsNumber()
	@Min(1)
	minAccessCount!: number
}

export class StorageConfigDto {
	@IsNumber()
	@Min(1)
	warningSize!: number

	@IsNumber()
	@Min(1)
	criticalSize!: number

	@IsNumber()
	@Min(1)
	warningFileCount!: number

	@IsNumber()
	@Min(1)
	criticalFileCount!: number

	@IsDefined()
	@ValidateNested()
	@Type(() => StorageCleanupConfigDto)
	cleanup!: StorageCleanupConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => StorageEvictionConfigDto)
	eviction!: StorageEvictionConfigDto
}
