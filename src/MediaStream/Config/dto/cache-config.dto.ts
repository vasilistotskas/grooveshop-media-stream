import { Type } from 'class-transformer'
import { IsBoolean, IsDefined, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator'

export class MemoryCacheConfigDto {
	@IsNumber()
	@Min(1)
	maxSize!: number

	@IsNumber()
	@Min(1)
	defaultTtl!: number

	@IsNumber()
	@Min(1)
	checkPeriod!: number

	@IsNumber()
	@Min(1)
	maxKeys!: number

	@IsNumber()
	@Min(1)
	@Max(100)
	warningThreshold!: number
}

export class RedisConfigDto {
	@IsString()
	host!: string

	@IsNumber()
	@Min(1)
	@Max(65535)
	port!: number

	@IsOptional()
	@IsString()
	password?: string

	@IsNumber()
	@Min(0)
	@Max(15)
	db!: number

	@IsNumber()
	@Min(1)
	ttl!: number

	@IsNumber()
	@Min(1)
	maxRetries!: number

	@IsNumber()
	@Min(0)
	healthCheckCacheTtl!: number
}

export class FileCacheConfigDto {
	@IsString()
	directory!: string
}

export class CacheWarmingConfigDto {
	@IsBoolean()
	enabled!: boolean

	@IsBoolean()
	warmupOnStart!: boolean

	@IsNumber()
	@Min(1)
	maxFilesToWarm!: number

	@IsString()
	warmupCron!: string

	@IsNumber()
	@Min(1)
	popularImageThreshold!: number

	@IsNumber()
	@Min(1)
	baseTtl!: number
}

export class ImageCacheConfigDto {
	@IsNumber()
	@Min(1)
	publicTtl!: number

	@IsNumber()
	@Min(1)
	privateTtl!: number

	@IsNumber()
	@Min(1)
	negativeCacheTtl!: number
}

export class CacheConfigDto {
	@IsDefined()
	@ValidateNested()
	@Type(() => MemoryCacheConfigDto)
	memory!: MemoryCacheConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => RedisConfigDto)
	redis!: RedisConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => FileCacheConfigDto)
	file!: FileCacheConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => CacheWarmingConfigDto)
	warming!: CacheWarmingConfigDto

	@IsDefined()
	@ValidateNested()
	@Type(() => ImageCacheConfigDto)
	image!: ImageCacheConfigDto
}
