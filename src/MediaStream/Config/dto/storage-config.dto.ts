import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsIn, IsNumber, IsString, Max, Min, ValidateNested } from 'class-validator'

export class StorageCleanupConfigDto {
	@IsBoolean()
	enabled: boolean = true

	@IsString()
	cronSchedule: string = '0 2 * * *'

	@IsBoolean()
	dryRun: boolean = false

	@IsNumber()
	@Min(1000)
	maxDuration: number = 300000
}

export class StorageEvictionConfigDto {
	@IsIn(['lru', 'lfu', 'size-based', 'age-based', 'intelligent'])
	strategy: string = 'intelligent'

	@IsIn(['conservative', 'moderate', 'aggressive'])
	aggressiveness: string = 'moderate'

	@IsBoolean()
	preservePopular: boolean = true

	@IsNumber()
	@Min(1)
	minAccessCount: number = 5

	@IsNumber()
	@Min(1)
	maxFileAge: number = 7
}

export class StorageOptimizationConfigDto {
	@IsBoolean()
	enabled: boolean = true

	@IsArray()
	@IsString({ each: true })
	strategies: string[] = ['deduplication']

	@IsNumber()
	@Min(1)
	popularThreshold: number = 10

	@IsNumber()
	@Min(0)
	@Max(9)
	compressionLevel: number = 6

	@IsBoolean()
	createBackups: boolean = false

	@IsNumber()
	@Min(1000)
	maxTime: number = 600000
}

export class StorageConfigDto {
	@IsNumber()
	@Min(1)
	maxSize: number = 1073741824

	@IsNumber()
	@Min(1)
	maxFileAge: number = 30

	@IsNumber()
	@Min(1)
	warningSize: number = 838860800

	@IsNumber()
	@Min(1)
	criticalSize: number = 1073741824

	@IsNumber()
	@Min(1)
	warningFileCount: number = 5000

	@IsNumber()
	@Min(1)
	criticalFileCount: number = 10000

	@ValidateNested()
	@Type(() => StorageCleanupConfigDto)
	cleanup: StorageCleanupConfigDto = new StorageCleanupConfigDto()

	@ValidateNested()
	@Type(() => StorageEvictionConfigDto)
	eviction: StorageEvictionConfigDto = new StorageEvictionConfigDto()

	@ValidateNested()
	@Type(() => StorageOptimizationConfigDto)
	optimization: StorageOptimizationConfigDto = new StorageOptimizationConfigDto()
}
