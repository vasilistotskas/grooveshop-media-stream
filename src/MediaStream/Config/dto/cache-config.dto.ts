import { Type } from 'class-transformer'
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator'

export class MemoryCacheConfigDto {
	@IsNumber()
	@Min(1)
	maxSize: number = 104857600

	@IsNumber()
	@Min(1)
	defaultTtl: number = 3600

	@IsNumber()
	@Min(1)
	checkPeriod: number = 600

	@IsNumber()
	@Min(1)
	maxKeys: number = 1000

	@IsNumber()
	@Min(1)
	@Max(100)
	warningThreshold: number = 80
}

export class RedisConfigDto {
	@IsString()
	host: string = 'localhost'

	@IsNumber()
	@Min(1)
	@Max(65535)
	port: number = 6379

	@IsOptional()
	@IsString()
	password?: string

	@IsNumber()
	@Min(0)
	@Max(15)
	db: number = 0

	@IsNumber()
	@Min(1)
	ttl: number = 7200

	@IsNumber()
	@Min(1)
	maxRetries: number = 3

	@IsNumber()
	@Min(100)
	retryDelayOnFailover: number = 100

	@IsNumber()
	@Min(0)
	healthCheckCacheTtl: number = 10000
}

export class FileCacheConfigDto {
	@IsString()
	directory: string = './storage'
}

export class CacheWarmingConfigDto {
	@IsBoolean()
	enabled: boolean = true

	@IsBoolean()
	warmupOnStart: boolean = true

	@IsNumber()
	@Min(1)
	maxFilesToWarm: number = 50

	@IsString()
	warmupCron: string = '0 */6 * * *'

	@IsNumber()
	@Min(1)
	popularImageThreshold: number = 5

	@IsNumber()
	@Min(1)
	baseTtl: number = 3600
}

export class CachePreloadingConfigDto {
	@IsBoolean()
	enabled: boolean = false

	@IsNumber()
	@Min(1000)
	interval: number = 300000
}

export class ImageCacheConfigDto {
	@IsNumber()
	@Min(1)
	publicTtl: number = 12 * 30 * 24 * 3600

	@IsNumber()
	@Min(1)
	privateTtl: number = 6 * 30 * 24 * 3600

	@IsNumber()
	@Min(1)
	negativeCacheTtl: number = 300
}

export class CacheConfigDto {
	@ValidateNested()
	@Type(() => MemoryCacheConfigDto)
	memory: MemoryCacheConfigDto = new MemoryCacheConfigDto()

	@ValidateNested()
	@Type(() => RedisConfigDto)
	redis: RedisConfigDto = new RedisConfigDto()

	@ValidateNested()
	@Type(() => FileCacheConfigDto)
	file: FileCacheConfigDto = new FileCacheConfigDto()

	@ValidateNested()
	@Type(() => CacheWarmingConfigDto)
	warming: CacheWarmingConfigDto = new CacheWarmingConfigDto()

	@ValidateNested()
	@Type(() => CachePreloadingConfigDto)
	preloading: CachePreloadingConfigDto = new CachePreloadingConfigDto()

	@ValidateNested()
	@Type(() => ImageCacheConfigDto)
	image: ImageCacheConfigDto = new ImageCacheConfigDto()
}
