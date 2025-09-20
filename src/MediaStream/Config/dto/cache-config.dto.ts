import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator'

export class MemoryCacheConfigDto {
	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value) || 104857600)
	maxSize: number = 104857600

	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value) || 3600)
	ttl: number = 3600

	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value) || 600)
	checkPeriod: number = 600

	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true || false)
	useClones: boolean = false

	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true)
	deleteOnExpire: boolean = true
}

export class RedisConfigDto {
	@IsString()
	@Transform(({ value }) => value || 'localhost')
	host: string = 'localhost'

	@IsNumber()
	@Min(1)
	@Max(65535)
	@Transform(({ value }) => Number.parseInt(value) || 6379)
	port: number = 6379

	@IsOptional()
	@IsString()
	password?: string

	@IsNumber()
	@Min(0)
	@Max(15)
	@Transform(({ value }) => Number.parseInt(value) || 0)
	db: number = 0

	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value) || 7200)
	ttl: number = 7200

	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value) || 3)
	maxRetries: number = 3

	@IsNumber()
	@Min(100)
	@Transform(({ value }) => Number.parseInt(value) || 100)
	retryDelayOnFailover: number = 100
}

export class FileCacheConfigDto {
	@IsString()
	@Transform(({ value }) => value || './storage')
	directory: string = './storage'

	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value) || 1073741824)
	maxSize: number = 1073741824

	@IsNumber()
	@Min(1)
	@Transform(({ value }) => Number.parseInt(value) || 3600)
	cleanupInterval: number = 3600
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
}
